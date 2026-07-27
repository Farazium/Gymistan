"""Bulk-import a gym's existing members from a CSV.

Written for gyms joining with years of history already on paper (or in a cash
ledger spreadsheet). Run it as many times as needed: a member already on file —
matched by member id or phone within that gym — is left untouched, so a re-run
after fixing a few rows only adds what was missing.

    python manage.py import_members --gym 10 --csv members.csv --dry-run
    python manage.py import_members --gym 10 --csv members.csv

CSV columns (header row required):
    member_id     the gym's own form/registration number      (optional)
    name          required
    phone         required, any local format — normalised to 03xxxxxxxxx
    join_date     required, YYYY-MM-DD
    package       required, must match a package name on that gym
    father_name   optional
    notes         optional

Expiry is derived, never taken from the file: join date + the package's own
duration, keeping the joining day as the anchor. A membership whose derived
expiry has already passed lands as EXPIRED, which is the honest state for a
member whose last recorded payment was months ago — taking a payment moves them
to ACTIVE through the normal renewal path.

Rows that cannot be imported are never silently dropped: pass --rejects to write
them to their own CSV, with the reason, to hand back to the gym.
"""
import csv
import datetime

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils.timezone import localdate

from apps.common.dates import add_months
from apps.gyms.models import Gym
from apps.members.models import Member
from apps.packages.models import Package

FIELDS = ['member_id', 'name', 'phone', 'join_date', 'package', 'father_name', 'notes']


def normalise_phone(raw):
    """Local mobile in any of the shapes a spreadsheet holds it — 3121234567,
    03121234567, +923121234567, 0312-1234567 — down to one 03xxxxxxxxx form.
    Anything that isn't a plausible mobile comes back as None so the row can be
    rejected rather than stored as a number nobody can dial."""
    digits = ''.join(ch for ch in str(raw or '') if ch.isdigit())
    if digits.startswith('92'):
        digits = digits[2:]
    digits = digits.lstrip('0')
    if len(digits) == 10 and digits.startswith('3'):
        return '0' + digits
    return None


class Command(BaseCommand):
    help = "Import a gym's existing members from a CSV."

    def add_arguments(self, parser):
        parser.add_argument('--gym', type=int, required=True, help='Gym id to import into.')
        parser.add_argument('--csv', required=True, help='Path to the source CSV.')
        parser.add_argument('--dry-run', action='store_true',
                            help='Report what would happen and write nothing.')
        parser.add_argument('--rejects', help='Path to write rejected rows (with reasons).')

    def handle(self, *args, **opts):
        dry = opts['dry_run']
        try:
            gym = Gym.objects.get(pk=opts['gym'])
        except Gym.DoesNotExist:
            raise CommandError(f'No gym with id {opts["gym"]}')

        packages = {p.name.strip().lower(): p for p in Package.objects.filter(gym=gym)}
        if not packages:
            raise CommandError(f'{gym.name} has no packages yet — create them first.')

        with open(opts['csv'], newline='', encoding='utf-8-sig') as fh:
            rows = list(csv.DictReader(fh))
        missing = [f for f in ('name', 'phone', 'join_date', 'package') if rows and f not in rows[0]]
        if missing:
            raise CommandError(f'CSV is missing required column(s): {", ".join(missing)}')

        # Already on file, so a re-run adds only what is new.
        taken_phones = set(Member.objects.filter(gym=gym).values_list('phone', flat=True))
        taken_ids = {m for m in Member.objects.filter(gym=gym)
                     .values_list('member_id', flat=True) if m}

        today = localdate()
        created, rejects, skipped = [], [], []

        for n, row in enumerate(rows, start=2):   # 2 = first row under the header
            row = {k: (v or '').strip() for k, v in row.items() if k}
            name = ' '.join(row.get('name', '').split())
            phone = normalise_phone(row.get('phone'))
            member_id = row.get('member_id', '')[:5]

            def reject(reason):
                rejects.append({**row, 'csv_row': n, 'reason': reason})

            if not name:
                reject('no name')
                continue
            if not phone:
                reject(f'unusable phone ({row.get("phone") or "blank"})')
                continue
            try:
                join_date = datetime.date.fromisoformat(row['join_date'])
            except (KeyError, ValueError):
                reject(f'unusable join date ({row.get("join_date") or "blank"})')
                continue
            package = packages.get(row.get('package', '').strip().lower())
            if not package:
                reject(f'unknown package ({row.get("package") or "blank"})')
                continue
            if phone in taken_phones:
                skipped.append({**row, 'csv_row': n, 'reason': f'phone {phone} already on file'})
                continue
            if member_id and member_id in taken_ids:
                skipped.append({**row, 'csv_row': n, 'reason': f'member id {member_id} already on file'})
                continue

            expiry = add_months(join_date, package.duration_months, anchor_day=join_date.day)
            created.append(Member(
                gym=gym, package=package, member_id=member_id or None, name=name, phone=phone,
                gender=Member.Gender.MALE, father_name=row.get('father_name', ''),
                join_date=join_date, expiry_date=expiry,
                status=Member.Status.EXPIRED if expiry <= today else Member.Status.ACTIVE,
                notes=row.get('notes', ''),
            ))
            taken_phones.add(phone)
            if member_id:
                taken_ids.add(member_id)

        active = sum(1 for m in created if m.status == Member.Status.ACTIVE)
        self.stdout.write(f'{gym.name} (id {gym.pk})')
        self.stdout.write(f'  read from CSV        {len(rows)}')
        self.stdout.write(f'  to import            {len(created)}  '
                          f'({len(created) - active} expired, {active} still active)')
        self.stdout.write(f'  already on file      {len(skipped)}')
        self.stdout.write(self.style.WARNING(f'  rejected             {len(rejects)}'))
        for r in rejects:
            self.stdout.write(f'      row {r["csv_row"]}: {r.get("name") or "(no name)"} — {r["reason"]}')

        if opts['rejects'] and (rejects or skipped):
            with open(opts['rejects'], 'w', newline='', encoding='utf-8-sig') as fh:
                w = csv.DictWriter(fh, fieldnames=FIELDS + ['csv_row', 'reason'],
                                   extrasaction='ignore')
                w.writeheader()
                w.writerows(rejects + skipped)
            self.stdout.write(f'  wrote rejects to {opts["rejects"]}')

        if dry:
            self.stdout.write(self.style.WARNING('\nDry run — nothing written.'))
            return

        with transaction.atomic():
            Member.objects.bulk_create(created)
        self.stdout.write(self.style.SUCCESS(f'\nImported {len(created)} member(s).'))
