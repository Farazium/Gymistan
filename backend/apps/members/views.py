from rest_framework import generics, filters, serializers
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from django.db import IntegrityError
from django.db.models import Q
from django.utils import timezone
from .models import Member
from .queries import expired_q, partial_q, fully_paid_active_q
from .serializers import MemberSerializer, MemberListSerializer
from apps.accounts.permissions import IsGymMember
from apps.payments.models import Payment
from apps.payments.services import apply_payment
from apps.payments.utils import (
    send_whatsapp_welcome, send_whatsapp_expiry_reminder,
    send_whatsapp_dues_reminder, OUT_OF_CREDITS,
)
from apps.gyms.models import WA_TIERS, AT_TIERS
from decimal import Decimal, InvalidOperation
import calendar
import datetime
import logging


def _truthy(v):
    return str(v).lower() in ('1', 'true', 'yes', 'on')


def _decimal(value, default='0'):
    try:
        return Decimal(str(value if value not in (None, '') else default))
    except (InvalidOperation, ValueError, TypeError):
        return Decimal(default)


def _create_admission_payment(request, member, rejoin=False):
    """Record what the member handed over on the way in, as a single payment.

    Two shapes, depending on the form:

    * `collect_fee` off — the old behaviour: an admission-fee-only payment (or
      nothing at all when no fee was entered).
    * `collect_fee` on — one payment covering the admission fee *and* the first
      package fee, so the books show one receipt for one hand-over of cash rather
      than two records the accountant has to mentally add up. It may be settled in
      full or in part; `apply_payment` works out which and carries any shortfall
      as dues.

    Returns the payment, or None when there was nothing to record.
    """
    fee = _decimal(request.data.get('admission_fee'))
    if fee < 0:
        fee = Decimal('0')

    collect_fee = _truthy(request.data.get('collect_fee'))
    package = member.package if collect_fee else None
    package_price = _decimal(package.price) if package else Decimal('0')
    # A member being restored may have walked out owing money; that balance is
    # folded in here rather than left behind for someone to notice later.
    carried = max(_decimal(member.dues), Decimal('0')) if collect_fee else Decimal('0')

    amount = fee + package_price + carried
    if amount <= 0:
        return None

    discount = _decimal(request.data.get('discount')) if collect_fee else Decimal('0')
    # Nothing already charged can be discounted — only what is being charged now.
    discount = min(max(discount, Decimal('0')), amount - carried)
    payable = amount - discount

    amount_paid = payable
    if collect_fee and str(request.data.get('payment_type') or '').upper() == 'PARTIAL':
        amount_paid = min(max(_decimal(request.data.get('amount_paid')), Decimal('0')), payable)

    payment = Payment.objects.create(
        gym=request.user.gym,
        member=member,
        package=package,
        collected_by=request.user,
        amount=amount,
        discount=discount,
        amount_paid=amount_paid,
        admission_amount=fee,
        dues_amount=carried,
        payment_method='ONLINE' if str(request.data.get('payment_method')).upper() == 'ONLINE' else 'CASH',
        notes='Admission fee' if not collect_fee else 'Admission + first payment',
        is_rejoin=rejoin,
        is_joining=True,
    )
    return apply_payment(payment)


def _maybe_send_welcome(request, member, welcome_back=False, admission_payment=None):
    """Fire a WhatsApp welcome if the caller asked for it and the gym tier allows it.
    Best-effort: never blocks the add/restore response on a messaging failure.

    The admission payment rides along so the member is sent the same slip the gym can
    download. A delivered welcome then marks that payment's receipt as sent, since it
    IS the receipt — the UI must not offer to send the identical PDF a second time."""
    if not _truthy(request.data.get('send_welcome')):
        return
    if member.gym.tier not in WA_TIERS:
        return
    try:
        sent, _ = send_whatsapp_welcome(member, welcome_back=welcome_back,
                                        admission_payment=admission_payment)
    except Exception:
        # Best-effort: never fail the add/restore on a messaging error, but don't
        # swallow it silently either — a broken welcome must be diagnosable.
        logging.getLogger(__name__).exception('welcome WhatsApp send failed for member %s', member.id)
        return
    if sent and admission_payment:
        admission_payment.slip_sent = True
        admission_payment.save(update_fields=['slip_sent'])


def _maybe_add_to_device(request, member):
    """Push a newly-added member onto the biometric device when the form asks for
    it and the plan includes attendance. Best-effort: a device that's offline or
    unset never blocks adding the member."""
    if not _truthy(request.data.get('add_to_device')):
        return
    if member.gym.tier not in AT_TIERS:
        return
    from apps.attendance.device_actions import run_async
    run_async(_push_member_to_device, member)


def _push_member_to_device(member):
    """Best-effort push of one member onto the biometric device. Assumes the
    caller has already checked the plan/flag. Runs off the request thread (see
    run_async) because an offline device can block for ~50s before timing out."""
    from apps.attendance.models import DeviceConfig
    from apps.attendance.device_actions import push_person
    try:
        cfg = DeviceConfig.objects.filter(gym=member.gym).first()
        if cfg and cfg.ip:
            push_person(cfg, member)
    except Exception:
        pass


def _repush_to_device(member):
    """After a restore, re-create the member's record on the device (soft delete
    removed it). Best-effort and off the request thread — a restore must never
    wait on (or be blocked from sending its welcome by) an offline device."""
    if member.gym.tier not in AT_TIERS or not member.device_user_id:
        return
    from apps.attendance.device_actions import run_async
    run_async(_push_member_to_device, member)


class MemberNextIdView(APIView):
    permission_classes = [IsAuthenticated, IsGymMember]

    def get(self, request):
        existing = Member.objects.filter(
            gym=request.user.gym,
            member_id__isnull=False,
        ).exclude(member_id='').values_list('member_id', flat=True)
        used = {int(x) for x in existing if x.isdigit()}
        # Smallest free ID — fills gaps left by removed members instead of always
        # going max+1, so the number never runs away toward the digit ceiling.
        next_num = 1
        while next_num in used:
            next_num += 1
        return Response({'next_id': str(next_num).zfill(5)})


class MemberListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated, IsGymMember]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['package', 'gender']
    ordering_fields = ['name', 'join_date', 'expiry_date']
    ordering = ['-created_at']

    def get_serializer_class(self):
        if self.request.method == 'GET':
            return MemberListSerializer
        return MemberSerializer

    def get_queryset(self):
        # Blacklisted members are managed from their own list — keep them out of
        # the main roster, same as soft-deleted members.
        qs = Member.objects.filter(
            gym=self.request.user.gym, is_deleted=False, blacklisted=False
        ).select_related('package')

        status = self.request.query_params.get('status')
        if status == 'ACTIVE':
            # Matches the badge: a part-paid member is filed under Partial, not here.
            qs = qs.filter(fully_paid_active_q())
        elif status == 'PARTIAL':
            qs = qs.filter(partial_q())
        elif status == 'EXPIRED':
            qs = qs.filter(expired_q())

        has_trainer = self.request.query_params.get('has_trainer')
        if has_trainer == 'true':
            qs = qs.filter(trainer__isnull=False)
        elif has_trainer == 'false':
            qs = qs.filter(trainer__isnull=True)

        search = self.request.query_params.get('search', '').strip()
        search_by = self.request.query_params.get('search_by', 'name')
        if search:
            field_map = {
                'name': 'name__icontains',
                'father_name': 'father_name__icontains',
                'phone': 'phone__icontains',
                'member_id': 'member_id__icontains',
            }
            lookup = field_map.get(search_by, 'name__icontains')
            qs = qs.filter(**{lookup: search})

        return qs

    def perform_create(self, serializer):
        try:
            member = serializer.save(gym=self.request.user.gym)
        except IntegrityError as e:
            err = str(e).lower()
            if 'phone' in err:
                raise serializers.ValidationError({'phone': 'A member with this phone number already exists'})
            if 'device' in err:
                raise serializers.ValidationError({'device_user_id': 'This Device ID is already mapped to another member'})
            raise serializers.ValidationError({'member_id': 'This Member ID is already occupied'})
        admission = _create_admission_payment(self.request, member)
        _maybe_send_welcome(self.request, member, welcome_back=False,
                            admission_payment=admission)
        _maybe_add_to_device(self.request, member)


class MemberDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = MemberSerializer
    permission_classes = [IsAuthenticated, IsGymMember]

    def get_queryset(self):
        # Not restricted to non-deleted: deleted/blacklisted profiles remain
        # viewable (their detail pages are linked from those management lists).
        return Member.objects.filter(gym=self.request.user.gym)

    def perform_destroy(self, instance):
        # Removed from the roster → also drop them off the device so they can't
        # punch in. Their device id is kept (restore re-pushes them), but the
        # fingerprint is gone and must be re-enrolled on restore. Done off the
        # request thread: an offline device can block ~30s, and the delete must
        # not wait on it.
        from apps.attendance.device_actions import remove_person_from_device, run_async
        run_async(remove_person_from_device, instance)
        instance.is_deleted = True
        instance.deleted_at = timezone.now()
        instance.has_fingerprint = False
        instance.save(update_fields=['is_deleted', 'deleted_at', 'has_fingerprint'])


class DeletedMembersView(APIView):
    permission_classes = [IsAuthenticated, IsGymMember]

    def get(self, request):
        members = Member.objects.filter(gym=request.user.gym, is_deleted=True).select_related('package')
        data = MemberListSerializer(members, many=True).data
        return Response(data)


class RestoreMemberView(APIView):
    permission_classes = [IsAuthenticated, IsGymMember]

    def post(self, request, pk):
        # Restore applies to members pulled out of the roster — either
        # soft-deleted or blacklisted. Restoring clears both flags.
        try:
            member = Member.objects.get(
                Q(is_deleted=True) | Q(blacklisted=True),
                pk=pk, gym=request.user.gym,
            )
        except Member.DoesNotExist:
            return Response({'detail': 'Not found'}, status=404)
        member.is_deleted = False
        member.deleted_at = None
        member.blacklisted = False
        member.blacklist_reason = ''
        member.blacklist_until = None
        member.blacklisted_at = None
        if request.data.get('join_date'):
            member.join_date = request.data['join_date']
        if request.data.get('package'):
            from apps.packages.models import Package
            try:
                member.package = Package.objects.get(pk=request.data['package'], gym=request.user.gym)
            except Package.DoesNotExist:
                pass
        if 'trainer' in request.data:
            tid = request.data.get('trainer')
            if tid:
                from apps.trainers.models import Trainer
                try:
                    member.trainer = Trainer.objects.get(pk=tid, gym=request.user.gym)
                except Trainer.DoesNotExist:
                    pass
            else:
                member.trainer = None
        if request.data.get('expiry_date'):
            member.expiry_date = request.data['expiry_date']
        member.save()
        # join_date/expiry_date were assigned as raw strings from the request, so
        # the in-memory instance still holds strings. Reload to get proper date
        # objects before building the welcome slip (which calls strftime on them).
        member.refresh_from_db()
        _repush_to_device(member)
        admission = _create_admission_payment(request, member, rejoin=True)
        _maybe_send_welcome(request, member, welcome_back=True,
                            admission_payment=admission)
        return Response({'detail': 'Member restored'})


class HardDeleteMemberView(APIView):
    permission_classes = [IsAuthenticated, IsGymMember]

    def delete(self, request, pk):
        try:
            member = Member.objects.get(pk=pk, gym=request.user.gym, is_deleted=True)
        except Member.DoesNotExist:
            return Response({'detail': 'Not found'}, status=404)
        # Permanent delete → also drop them off the biometric device. Off the
        # request thread (offline device blocks ~30s); the thread keeps its own
        # reference to the member, so the device id survives the row delete below.
        from apps.attendance.device_actions import remove_person_from_device, run_async
        run_async(remove_person_from_device, member)
        member.delete()
        return Response(status=204)


class BlacklistedMembersView(APIView):
    """List all blacklisted members of the gym (active bans first)."""
    permission_classes = [IsAuthenticated, IsGymMember]

    def get(self, request):
        members = (Member.objects
                   .filter(gym=request.user.gym, is_deleted=False, blacklisted=True)
                   .select_related('package')
                   .order_by('-blacklisted_at'))
        data = MemberListSerializer(members, many=True).data
        return Response(data)


class BlacklistMemberView(APIView):
    """POST to blacklist a member (reason + optional duration in months, or
    indefinite). DELETE to lift the ban."""
    permission_classes = [IsAuthenticated, IsGymMember]

    def _get_member(self, request, pk):
        return Member.objects.get(pk=pk, gym=request.user.gym, is_deleted=False)

    def post(self, request, pk):
        try:
            member = self._get_member(request, pk)
        except Member.DoesNotExist:
            return Response({'detail': 'Not found'}, status=404)

        reason = (request.data.get('reason') or '').strip()
        if not reason:
            return Response({'reason': 'A reason is required'}, status=400)

        indefinite = _truthy(request.data.get('indefinite'))
        until = None
        if not indefinite:
            months = request.data.get('duration_months')
            try:
                months = int(months)
            except (TypeError, ValueError):
                return Response({'duration_months': 'Enter a whole number of months, or choose indefinite'}, status=400)
            if months < 1:
                return Response({'duration_months': 'Duration must be at least 1 month'}, status=400)
            today = timezone.localdate()
            # Add `months` calendar months, clamping the day to the target month's length.
            total = today.month - 1 + months
            year = today.year + total // 12
            month = total % 12 + 1
            day = min(today.day, calendar.monthrange(year, month)[1])
            until = datetime.date(year, month, day)


        member.blacklisted = True
        member.blacklist_reason = reason
        member.blacklist_until = until
        member.blacklisted_at = timezone.now()
        member.save(update_fields=['blacklisted', 'blacklist_reason', 'blacklist_until', 'blacklisted_at'])
        return Response(MemberSerializer(member).data)

    def delete(self, request, pk):
        try:
            member = self._get_member(request, pk)
        except Member.DoesNotExist:
            return Response({'detail': 'Not found'}, status=404)
        member.blacklisted = False
        member.blacklist_reason = ''
        member.blacklist_until = None
        member.blacklisted_at = None
        member.save(update_fields=['blacklisted', 'blacklist_reason', 'blacklist_until', 'blacklisted_at'])
        return Response(MemberSerializer(member).data)


class SendReminderView(APIView):
    """Send a one-off WhatsApp renewal reminder to a member (from the dashboard).

    Idempotent per expiry date: once a reminder is sent for the member's current
    expiry_date it can't be sent again (guarded by Member.reminder_sent_for), so
    the same person isn't pinged repeatedly for the same expiry."""
    permission_classes = [IsAuthenticated, IsGymMember]

    def post(self, request, pk):
        try:
            member = Member.objects.get(pk=pk, gym=request.user.gym, is_deleted=False)
        except Member.DoesNotExist:
            return Response({'message': 'Member not found'}, status=404)
        if member.gym.tier not in WA_TIERS:
            return Response({'message': 'WhatsApp is not enabled for your plan'}, status=403)
        if member.gym.wa_exhausted:
            return Response({'message': OUT_OF_CREDITS, 'out_of_credits': True}, status=402)
        if not member.phone:
            return Response({'message': 'Member has no phone number'}, status=400)
        if member.reminder_sent_for == member.expiry_date:
            return Response({'message': 'Reminder already sent for this expiry'}, status=400)
        ok, detail = send_whatsapp_expiry_reminder(member)
        if not ok:
            return Response({'message': detail or 'Failed to send reminder'}, status=502)
        member.reminder_sent_for = member.expiry_date
        member.save(update_fields=['reminder_sent_for'])
        return Response({'message': 'Reminder sent', 'reminder_sent': True})


class SendDuesReminderView(APIView):
    """Nudge a member about the fee they still owe.

    Idempotent per balance: once a reminder goes out for the amount currently
    outstanding it can't be sent again, so nobody is chased twice for the same
    figure. Paying part of it changes the amount and re-opens the button."""
    permission_classes = [IsAuthenticated, IsGymMember]

    def post(self, request, pk):
        try:
            member = Member.objects.get(pk=pk, gym=request.user.gym, is_deleted=False)
        except Member.DoesNotExist:
            return Response({'message': 'Member not found'}, status=404)
        if member.gym.tier not in WA_TIERS:
            return Response({'message': 'WhatsApp is not enabled for your plan'}, status=403)
        if member.gym.wa_exhausted:
            return Response({'message': OUT_OF_CREDITS, 'out_of_credits': True}, status=402)
        if not member.phone:
            return Response({'message': 'Member has no phone number'}, status=400)
        if (member.dues or 0) <= 0:
            return Response({'message': 'This member has no outstanding dues'}, status=400)
        if member.dues_reminded_for == member.dues:
            return Response({'message': 'Reminder already sent for this amount'}, status=400)
        ok, detail = send_whatsapp_dues_reminder(member)
        if not ok:
            return Response({'message': detail or 'Failed to send reminder'}, status=502)
        member.dues_reminded_for = member.dues
        member.save(update_fields=['dues_reminded_for'])
        return Response({'message': 'Reminder sent', 'reminder_sent': True})
