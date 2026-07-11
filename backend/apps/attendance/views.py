import datetime
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from apps.accounts.permissions import IsGymMember, HasAttendance
from apps.members.models import Member
from apps.trainers.models import Trainer
from .models import Attendance, DeviceConfig
from .serializers import DeviceConfigSerializer
from .services import record_punch, resolve_person
from .zk_service import sync_device, pull_device_users


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
            cfg.last_sync = summary['latest']
        cfg.last_sync_count = summary['applied']
        cfg.last_sync_status = (f"OK — {summary['applied']} new punches "
                                f"({summary['skipped_unknown']} unknown ids)")
        cfg.save()
        return Response({'message': cfg.last_sync_status, 'summary': summary})


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
