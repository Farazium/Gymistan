import datetime
import time
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated, AllowAny
from apps.accounts.permissions import IsGymMember, HasAttendance
from apps.gyms.models import AT_TIERS
from apps.members.models import Member
from apps.trainers.models import Trainer
from apps.members.serializers import compute_status
from .models import Attendance, DeviceConfig, new_agent_token
from .serializers import DeviceConfigSerializer
from .services import record_punch, record_punches, resolve_person
from .zk_service import (sync_device, pull_device_users, push_users,
                         delete_fingerprint, device_has_fingerprint, ping_device)
from .live import get_monitor, current_seq, stop_monitor, monitor_running, _HAS_ZK
from .enroll import start_enroll, enroll_status, cancel_enroll
from .device_actions import ensure_person_id, get_person


def _parse_date(s):
    try:
        return datetime.datetime.strptime(s, '%Y-%m-%d').date()
    except (TypeError, ValueError):
        return timezone.localdate()


def _range_for(scope, date):
    """Return (start, end, days[]) inclusive for the requested scope."""
    if scope == 'daily':
        return date, date, [date]
    if scope == 'weekly':
        start = date - datetime.timedelta(days=date.weekday())  # Monday
        days = [start + datetime.timedelta(days=i) for i in range(7)]
        return start, days[-1], days
    # monthly
    start = date.replace(day=1)
    if start.month == 12:
        nxt = start.replace(year=start.year + 1, month=1)
    else:
        nxt = start.replace(month=start.month + 1)
    end = nxt - datetime.timedelta(days=1)
    days = [start + datetime.timedelta(days=i) for i in range((end - start).days + 1)]
    return start, end, days


def _people(gym, kind):
    if kind == 'trainer':
        qs = Trainer.objects.filter(gym=gym, is_active=True).order_by('name')
        return [{'id': t.id, 'name': t.name, 'code': t.device_user_id or ''} for t in qs]
    qs = Member.objects.filter(gym=gym, is_deleted=False).order_by('name')
    return [{'id': m.id, 'name': m.name, 'code': m.member_id or ''} for m in qs]


class AttendanceView(APIView):
    permission_classes = [IsAuthenticated, IsGymMember, HasAttendance]

    def get(self, request):
        gym = request.user.gym
        kind = 'trainer' if request.query_params.get('type') == 'trainer' else 'member'
        scope = request.query_params.get('scope', 'daily')
        if scope not in ('daily', 'weekly', 'monthly'):
            scope = 'daily'
        date = _parse_date(request.query_params.get('date'))
        today = timezone.localdate()

        start, end, days = _range_for(scope, date)
        people = _people(gym, kind)
        pid = request.query_params.get('id')
        if pid:
            people = [p for p in people if str(p['id']) == str(pid)]

        # Pull all attendance rows in range for this person kind in one query.
        person_field = 'trainer_id' if kind == 'trainer' else 'member_id'
        recs = Attendance.objects.filter(gym=gym, date__gte=start, date__lte=end,
                                         **{f'{person_field.replace("_id","")}__isnull': False})
        # index: {(person_id, date): rec}
        by_key = {}
        for r in recs.values(person_field, 'date', 'check_in', 'check_out'):
            by_key[(r[person_field], r['date'])] = r

        def cell(pid, day):
            if day > today:
                return {'status': 'upcoming'}
            rec = by_key.get((pid, day))
            if not rec:
                return {'status': 'absent'}
            return {
                'status': 'present',
                'check_in': rec['check_in'].strftime('%H:%M') if rec['check_in'] else None,
                'check_out': rec['check_out'].strftime('%H:%M') if rec['check_out'] else None,
            }

        elapsed_days = [d for d in days if d <= today]
        rows = []
        for p in people:
            cells = {d.isoformat(): cell(p['id'], d) for d in days}
            present = sum(1 for d in elapsed_days if cells[d.isoformat()]['status'] == 'present')
            denom = len(elapsed_days) or 1
            rows.append({**p, 'days': cells, 'present': present,
                         'total': len(elapsed_days),
                         'rate': round(present / denom * 100)})

        # Per-day totals (present count) — powers the weekly/monthly chart.
        daily_totals = [{
            'date': d.isoformat(),
            'present': sum(1 for p in people if by_key.get((p['id'], d))),
            'upcoming': d > today,
        } for d in days]

        total_people = len(people)
        present_possible = total_people * (len(elapsed_days) or 1)
        present_records = sum(r['present'] for r in rows)

        if scope == 'daily':
            present_today = daily_totals[0]['present'] if daily_totals else 0
            stats = {
                'total': total_people,
                'present': present_today,
                'absent': total_people - present_today,
                'rate': round(present_today / (total_people or 1) * 100),
            }
        else:
            present_today = next((t['present'] for t in daily_totals if t['date'] == today.isoformat()), None)
            stats = {
                'total': total_people,
                'present_today': present_today,
                'avg_daily': round(present_records / (len(elapsed_days) or 1)),
                'rate': round(present_records / (present_possible or 1) * 100),
            }

        return Response({
            'type': kind, 'scope': scope, 'date': date.isoformat(),
            'range': {'start': start.isoformat(), 'end': end.isoformat()},
            'days': [d.isoformat() for d in days],
            'rows': rows,
            'daily_totals': daily_totals,
            'stats': stats,
        })


class MarkAttendanceView(APIView):
    """Manually mark or clear a person's attendance for a day (source=MANUAL).
    Useful when there is no device, or to fix a missed punch."""
    permission_classes = [IsAuthenticated, IsGymMember, HasAttendance]

    def post(self, request):
        gym = request.user.gym
        kind = 'trainer' if request.data.get('type') == 'trainer' else 'member'
        pid = request.data.get('id')
        date = _parse_date(request.data.get('date'))
        present = str(request.data.get('present', 'true')).lower() in ('1', 'true', 'yes', 'on')

        Model = Trainer if kind == 'trainer' else Member
        filt = {'gym': gym, 'pk': pid}
        if kind == 'member':
            filt['is_deleted'] = False
        try:
            obj = Model.objects.get(**filt)
        except Model.DoesNotExist:
            return Response({'message': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

        field = 'trainer' if kind == 'trainer' else 'member'
        if present:
            now = timezone.localtime()
            dt = datetime.datetime.combine(date, now.time() if date == timezone.localdate()
                                           else datetime.time(9, 0))
            record_punch(gym, kind, obj, dt, source=Attendance.Source.MANUAL)
        else:
            Attendance.objects.filter(gym=gym, date=date, **{field: obj}).delete()
        return Response({'message': 'present' if present else 'cleared'})


class DeviceConfigView(APIView):
    """Read or update this gym's ZKTeco device settings."""
    permission_classes = [IsAuthenticated, IsGymMember, HasAttendance]

    def get(self, request):
        cfg, _ = DeviceConfig.objects.get_or_create(gym=request.user.gym)
        return Response(DeviceConfigSerializer(cfg).data)

    def put(self, request):
        cfg, _ = DeviceConfig.objects.get_or_create(gym=request.user.gym)
        ser = DeviceConfigSerializer(cfg, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)


class AgentTokenResetView(APIView):
    """Reissue this gym's setup code. Whatever the old PC held stops working the
    moment this returns — the way to retire a machine you no longer control."""
    permission_classes = [IsAuthenticated, IsGymMember, HasAttendance]

    def post(self, request):
        cfg, _ = DeviceConfig.objects.get_or_create(gym=request.user.gym)
        cfg.agent_token = new_agent_token()
        cfg.agent_last_seen = None
        cfg.agent_version = ''
        cfg.save(update_fields=['agent_token', 'agent_last_seen', 'agent_version'])
        return Response(DeviceConfigSerializer(cfg).data)


class DevicePingView(APIView):
    """Test whether the configured device is reachable right now. Used by the
    settings panel to show a live online/offline status after saving. Fails fast
    on a dead IP (short timeout) so the request doesn't hang."""
    permission_classes = [IsAuthenticated, IsGymMember, HasAttendance]

    def post(self, request):
        cfg, _ = DeviceConfig.objects.get_or_create(gym=request.user.gym)
        ip = (request.data.get('ip') or cfg.ip or '').strip()
        if not ip:
            return Response({'online': False, 'message': 'No device IP configured'},
                            status=status.HTTP_400_BAD_REQUEST)
        port = request.data.get('port') or cfg.port or 4370
        password = request.data.get('password')
        if password in (None, ''):
            password = cfg.password or 0
        try:
            online, detail = ping_device(ip, port=int(port), password=int(password))
        except (TypeError, ValueError):
            return Response({'online': False, 'message': 'Invalid port or password'},
                            status=status.HTTP_400_BAD_REQUEST)
        return Response({'online': online, 'message': detail})


class DeviceSyncView(APIView):
    """Pull the latest punches from the device now. Records status on the config so
    the UI can show what happened (works gracefully with no device / no pyzk)."""
    permission_classes = [IsAuthenticated, IsGymMember, HasAttendance]

    def post(self, request):
        gym = request.user.gym
        cfg, _ = DeviceConfig.objects.get_or_create(gym=gym)
        if not cfg.ip:
            return Response({'message': 'No device IP configured'}, status=status.HTTP_400_BAD_REQUEST)

        cfg.last_sync_at = timezone.now()
        try:
            summary = sync_device(gym, cfg.ip, port=cfg.port, password=cfg.password,
                                  since=cfg.last_sync)
        except Exception as e:
            cfg.last_sync_status = f'Failed: {e}'[:255]
            cfg.save(update_fields=['last_sync_at', 'last_sync_status'])
            return Response({'message': cfg.last_sync_status}, status=status.HTTP_502_BAD_GATEWAY)

        if summary.get('latest'):
            # record_punches works in naive local; store it aware so the column
            # stays consistent with everything else Django writes.
            latest = summary['latest']
            cfg.last_sync = timezone.make_aware(latest) if timezone.is_naive(latest) else latest
        cfg.last_sync_count = summary['applied']
        cfg.last_sync_status = (f"OK — {summary['applied']} new punches "
                                f"({summary['skipped_unknown']} unknown ids)")
        cfg.save()
        return Response({'message': cfg.last_sync_status, 'summary': summary})


class DevicePushView(APIView):
    """Push members onto the device from the app so no one types names/ids on the
    keypad. Members without a device id get the smallest free numeric one first
    (kept unique across members and trainers so device ids never collide). The
    person then only places a finger on the sensor to enroll — no typing."""
    permission_classes = [IsAuthenticated, IsGymMember, HasAttendance]

    def post(self, request):
        gym = request.user.gym
        cfg, _ = DeviceConfig.objects.get_or_create(gym=gym)
        if not cfg.ip:
            return Response({'message': 'No device IP configured'}, status=status.HTTP_400_BAD_REQUEST)

        members = list(Member.objects.filter(gym=gym, is_deleted=False).order_by('name'))
        trainers = list(Trainer.objects.filter(gym=gym).order_by('name'))
        everyone = members + trainers

        # Reserve every device id already in use in this gym — including those held
        # by soft-deleted members, which still count against the unique constraint
        # (a deleted member keeps their id so a restore can re-push them). Building
        # `used` only from the active roster would hand a new member an id a deleted
        # one already owns, and the save would hit uniq_member_device_id.
        used = set()
        member_ids = Member.objects.filter(gym=gym).exclude(device_user_id='').values_list('device_user_id', flat=True)
        trainer_ids = Trainer.objects.filter(gym=gym).exclude(device_user_id='').values_list('device_user_id', flat=True)
        for duid in list(member_ids) + list(trainer_ids):
            if duid and str(duid).isdigit():
                used.add(int(duid))

        nxt = 1
        assigned = 0
        for p in everyone:
            if not p.device_user_id:
                while nxt in used:
                    nxt += 1
                p.device_user_id = str(nxt)
                used.add(nxt)
                p.save(update_fields=['device_user_id'])
                assigned += 1

        people = [(p.device_user_id, p.name) for p in everyone if p.device_user_id]
        if not people:
            return Response({'message': 'No one to push'})
        try:
            pushed, errors = push_users(cfg.ip, cfg.port, cfg.password, people)
        except Exception as e:
            return Response({'message': f'Failed: {e}'}, status=status.HTTP_502_BAD_GATEWAY)

        msg = f'Pushed {pushed} people to the device'
        if assigned:
            msg += f' — {assigned} got a new device ID'
        return Response({'message': msg, 'pushed': pushed, 'assigned': assigned,
                         'errors': errors[:10]})


class DeviceFingerprintStatusView(APIView):
    """Whether a member actually has a fingerprint on the device right now. Reads
    the device (the DB flag alone can drift), and reconciles the flag while here."""
    permission_classes = [IsAuthenticated, IsGymMember, HasAttendance]

    def get(self, request):
        gym = request.user.gym
        cfg, _ = DeviceConfig.objects.get_or_create(gym=gym)
        kind = request.query_params.get('type') or 'member'
        pid = request.query_params.get('id') or request.query_params.get('member_id')
        person = get_person(gym, kind, pid)
        if not person:
            return Response({'message': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

        # Can't ask the device — fall back to what we last recorded.
        if not person.device_user_id or not cfg.ip or not _HAS_ZK:
            return Response({'enrolled': bool(person.has_fingerprint), 'checked': False})

        if monitor_running(gym.id):
            stop_monitor(gym.id)
            time.sleep(3.5)
        try:
            enrolled = device_has_fingerprint(cfg.ip, cfg.port, cfg.password, person.device_user_id)
        except Exception:
            return Response({'enrolled': bool(person.has_fingerprint), 'checked': False})

        if enrolled != person.has_fingerprint:
            person.has_fingerprint = enrolled
            person.save(update_fields=['has_fingerprint'])
        return Response({'enrolled': enrolled, 'checked': True})


class DeviceEnrollView(APIView):
    """Start a remote fingerprint enrollment for a member (POST), or poll the
    running job's state (GET). The member is added to the device first if needed,
    then the device prompts them to place their finger — no keypad, no menus."""
    permission_classes = [IsAuthenticated, IsGymMember, HasAttendance]

    def post(self, request):
        gym = request.user.gym
        cfg, _ = DeviceConfig.objects.get_or_create(gym=gym)
        if not cfg.ip:
            return Response({'message': 'No device IP configured'}, status=status.HTTP_400_BAD_REQUEST)
        kind = request.data.get('type') or 'member'
        pid = request.data.get('id') or request.data.get('member_id')
        person = get_person(gym, kind, pid)
        if not person:
            return Response({'message': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        try:
            finger = int(request.data.get('finger') or 0)
        except (TypeError, ValueError):
            finger = 0

        uid = ensure_person_id(person)
        started, detail = start_enroll(gym.id, cfg.ip, cfg.port, cfg.password,
                                       uid, person.name, finger, kind=kind, person_id=person.id)
        if not started:
            return Response({'message': detail, 'started': False}, status=status.HTTP_409_CONFLICT)
        return Response({'message': 'Ask them to place their finger on the sensor',
                         'started': True, 'device_user_id': uid})

    def get(self, request):
        return Response(enroll_status(request.user.gym.id))

    def patch(self, request):
        """Cancel a running enrollment (the modal was closed)."""
        gym = request.user.gym
        cfg, _ = DeviceConfig.objects.get_or_create(gym=gym)
        cancel_enroll(gym.id, cfg.ip, cfg.port, cfg.password)
        return Response({'cancelled': True})

    def delete(self, request):
        """Remove a member's or trainer's fingerprint from the device."""
        gym = request.user.gym
        cfg, _ = DeviceConfig.objects.get_or_create(gym=gym)
        if not cfg.ip:
            return Response({'message': 'No device IP configured'}, status=status.HTTP_400_BAD_REQUEST)
        kind = request.data.get('type') or request.query_params.get('type') or 'member'
        pid = (request.data.get('id') or request.query_params.get('id')
               or request.data.get('member_id') or request.query_params.get('member_id'))
        person = get_person(gym, kind, pid)
        if not person or not person.device_user_id:
            return Response({'message': 'Not on the device'}, status=status.HTTP_404_NOT_FOUND)
        # Free the device from the live monitor before we touch it.
        stop_monitor(gym.id)
        time.sleep(3.5)
        try:
            delete_fingerprint(cfg.ip, cfg.port, cfg.password, person.device_user_id, finger=0)
        except Exception as e:
            return Response({'message': f'Failed: {e}'}, status=status.HTTP_502_BAD_GATEWAY)
        person.has_fingerprint = False
        person.save(update_fields=['has_fingerprint'])
        return Response({'message': 'Fingerprint removed', 'removed': True})


class DeviceLiveView(APIView):
    """Real-time entrance feed for the Live screen. Each call keeps the device's
    live capture alive and returns any punches newer than `after` (a seq number),
    each resolved to the person and their current status so the UI can play the
    right sound (ting for active, buzzer for expired)."""
    permission_classes = [IsAuthenticated, IsGymMember, HasAttendance]

    def get(self, request):
        gym = request.user.gym
        cfg, _ = DeviceConfig.objects.get_or_create(gym=gym)
        if not cfg.ip or not _HAS_ZK:
            return Response({'enabled': False, 'seq': 0, 'events': [],
                             'error': None if cfg.ip else 'No device configured'})

        # A fingerprint enrollment is using the device — don't grab it back, or
        # we'd break the enrollment and log its scans as attendance.
        if enroll_status(gym.id).get('state') == 'running':
            return Response({'enabled': True, 'seq': current_seq(gym.id), 'events': [],
                             'error': None, 'busy': 'enrolling'})

        mon = get_monitor(gym.id, cfg.ip, cfg.port, cfg.password)
        mon.touch()
        mon.ensure_running()

        # Persist any punches the monitor captured but hasn't written yet, so the
        # Live feed also keeps the attendance sheet current (record_punch is
        # idempotent, so a later Sync Now over the same logs won't duplicate).
        for e in [x for x in mon.events if x['seq'] > mon.recorded_seq]:
            person = resolve_person(gym, e['device_user_id'])
            if person:
                kind, obj = person
                try:
                    record_punch(gym, kind, obj, e['dt'])
                except Exception:
                    pass
        mon.recorded_seq = mon.seq

        try:
            after = int(request.query_params.get('after', 0))
        except (TypeError, ValueError):
            after = 0

        events = []
        for e in [x for x in mon.events if x['seq'] > after]:
            person = resolve_person(gym, e['device_user_id'])
            if person is None:
                events.append({'seq': e['seq'], 'time': e['time'], 'kind': 'unknown',
                               'name': f"ID {e['device_user_id']}", 'status': 'unknown'})
                continue
            kind, obj = person
            if kind == 'member':
                status_ = 'expired' if compute_status(obj) == 'EXPIRED' else 'active'
                expiry = obj.expiry_date.isoformat() if obj.expiry_date else None
            else:  # trainer — no membership to expire
                status_ = 'trainer'
                expiry = None
            events.append({'seq': e['seq'], 'time': e['time'], 'kind': kind,
                           'name': obj.name, 'status': status_, 'expiry': expiry})

        return Response({'enabled': True, 'seq': mon.seq, 'events': events,
                         'error': mon.error})


class DeviceUsersView(APIView):
    """List users enrolled on the device and whether each is mapped to a member/trainer.
    Powers the enrollment helper so admins don't hand-copy ids."""
    permission_classes = [IsAuthenticated, IsGymMember, HasAttendance]

    def get(self, request):
        gym = request.user.gym
        cfg, _ = DeviceConfig.objects.get_or_create(gym=gym)
        if not cfg.ip:
            return Response({'message': 'No device IP configured'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            users = pull_device_users(cfg.ip, port=cfg.port, password=cfg.password)
        except Exception as e:
            return Response({'message': f'Failed: {e}'}, status=status.HTTP_502_BAD_GATEWAY)

        for u in users:
            person = resolve_person(gym, u['user_id'])
            if person:
                kind, obj = person
                u['mapped_to'] = {'type': kind, 'id': obj.id, 'name': obj.name}
            else:
                u['mapped_to'] = None
        return Response({'users': users})


def _watermark_str(dt):
    """The watermark as naive local wall-clock — the same clock the device speaks,
    so the agent can compare it to a punch without timezone arithmetic. Accepts
    either an aware value (as stored) or a naive one (as record_punches returns)."""
    if dt is None:
        return None
    if timezone.is_aware(dt):
        dt = timezone.localtime(dt)
    return dt.replace(tzinfo=None).isoformat()


class AgentIngestView(APIView):
    """The gym-PC agent's door into the API.

    A cloud backend can never open a connection to a device sitting on a gym's
    private network, so the direction is reversed: a small agent runs on a PC at
    the gym, reads the device over the LAN, and posts punches up here.

    Authentication is the gym's own agent token, not a JWT — the agent lives on a
    machine at the gym, and a gym PC must never hold an admin login. The token
    identifies exactly one gym and can do exactly one thing: deliver punches.

    GET  → the watermark, so the agent only has to send what we haven't seen.
    POST → punches. Idempotent: record_punch upserts, so a retry after a dropped
           response can't double-count, and the watermark only ever moves forward.
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    MAX_PUNCHES = 5000  # a first sync of a long-running device, with room to spare

    def _config(self, request):
        token = (request.headers.get('X-Agent-Token') or '').strip()
        if not token:
            return None, Response({'detail': 'Missing setup code'},
                                  status=status.HTTP_401_UNAUTHORIZED)
        cfg = DeviceConfig.objects.select_related('gym').filter(agent_token=token).first()
        if not cfg:
            return None, Response({'detail': 'Setup code not recognised'},
                                  status=status.HTTP_401_UNAUTHORIZED)
        if cfg.gym.tier not in AT_TIERS:
            return None, Response({'detail': "This gym's plan doesn't include attendance"},
                                  status=status.HTTP_403_FORBIDDEN)
        if not cfg.gym.is_active:
            return None, Response({'detail': 'This gym is not active'},
                                  status=status.HTTP_403_FORBIDDEN)
        return cfg, None

    def _touch(self, cfg, request, fields):
        """Record that the agent called in, whatever the call was for."""
        cfg.agent_last_seen = timezone.now()
        cfg.agent_version = str(request.data.get('agent_version') or
                                request.query_params.get('agent_version') or '')[:20]
        serial = str(request.data.get('serial') or request.query_params.get('serial') or '')[:64]
        if serial:
            cfg.agent_serial = serial
        cfg.save(update_fields=[*fields, 'agent_last_seen', 'agent_version', 'agent_serial'])

    def get(self, request):
        cfg, err = self._config(request)
        if err:
            return err
        self._touch(cfg, request, [])
        return Response({
            'gym': cfg.gym.name,
            # Naive local wall-clock, matching what the device reports and what
            # record_punches compares against.
            'since': _watermark_str(cfg.last_sync),
        })

    def post(self, request):
        cfg, err = self._config(request)
        if err:
            return err

        raw = request.data.get('punches')
        if not isinstance(raw, list):
            return Response({'detail': 'punches must be a list'},
                            status=status.HTTP_400_BAD_REQUEST)
        if len(raw) > self.MAX_PUNCHES:
            return Response({'detail': f'Too many punches in one call (max {self.MAX_PUNCHES})'},
                            status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)

        punches, malformed = [], 0
        for item in raw:
            try:
                uid = str(item['uid']).strip()
                dt = datetime.datetime.fromisoformat(str(item['at']))
            except (KeyError, TypeError, ValueError):
                malformed += 1
                continue
            if dt.tzinfo is not None:          # keep everything naive-local
                dt = timezone.localtime(dt).replace(tzinfo=None)
            if uid:
                punches.append((uid, dt))

        summary = record_punches(cfg.gym, punches, since=cfg.last_sync)

        if summary.get('latest'):
            # record_punches works in naive local wall-clock; store it aware so
            # the column holds one kind of value and localtime() can read it back.
            latest = summary['latest']
            cfg.last_sync = timezone.make_aware(latest) if timezone.is_naive(latest) else latest
        cfg.last_sync_at = timezone.now()
        cfg.last_sync_count = summary['applied']
        cfg.last_sync_status = (f"Agent - {summary['applied']} new punches "
                                f"({summary['skipped_unknown']} unknown ids)")
        self._touch(cfg, request, ['last_sync', 'last_sync_at',
                                   'last_sync_count', 'last_sync_status'])

        return Response({
            'applied': summary['applied'],
            'skipped_unknown': summary['skipped_unknown'],
            'skipped_old': summary['skipped_old'],
            'malformed': malformed,
            'since': _watermark_str(cfg.last_sync),
        })
