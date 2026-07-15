"""Send a WhatsApp renewal reminder to members whose membership expires tomorrow.

Run daily. Designed to be scheduler-agnostic so the same command works in dev
(Windows Task Scheduler) and in production (cron / Celery-beat):

    python manage.py send_expiry_reminders

Options:
    --days N   Remind members expiring N days from today (default 1 = tomorrow).
    --dry-run  Show who would be reminded without sending or marking anything.
"""
import datetime
from django.core.management.base import BaseCommand
from apps.members.models import Member
from apps.payments.utils import send_whatsapp_expiry_reminder
from apps.gyms.models import WA_TIERS
from django.utils import timezone


class Command(BaseCommand):
    help = 'Send WhatsApp renewal reminders to members expiring soon.'

    def add_arguments(self, parser):
        parser.add_argument('--days', type=int, default=1,
                            help='Days ahead of expiry to remind (default 1).')
        parser.add_argument('--dry-run', action='store_true',
                            help='List targets without sending.')

    def handle(self, *args, **opts):
        target = timezone.localdate() + datetime.timedelta(days=opts['days'])
        dry = opts['dry_run']

        members = (Member.objects
                   .filter(is_deleted=False, expiry_date=target, gym__tier__in=WA_TIERS)
                   .exclude(phone='')
                   .select_related('gym'))

        self.stdout.write(f'{members.count()} member(s) expiring on {target}')
        sent = skipped = failed = 0

        for m in members:
            # Already reminded for this exact expiry date? Skip (idempotent re-runs).
            if m.reminder_sent_for == m.expiry_date:
                skipped += 1
                continue
            if dry:
                self.stdout.write(f'  would remind: {m.name} ({m.phone})')
                continue
            ok, detail = send_whatsapp_expiry_reminder(m)
            if ok:
                m.reminder_sent_for = m.expiry_date
                m.save(update_fields=['reminder_sent_for'])
                sent += 1
                self.stdout.write(self.style.SUCCESS(f'  sent: {m.name} ({m.phone})'))
            else:
                failed += 1
                self.stdout.write(self.style.ERROR(f'  FAILED: {m.name} ({m.phone}) -> {detail}'))

        self.stdout.write(self.style.SUCCESS(
            f'Done. sent={sent} skipped={skipped} failed={failed}'))
