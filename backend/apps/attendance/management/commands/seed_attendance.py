"""Generate dummy attendance so the Attendance page can be built/tested without a
real ZKTeco device.

    python manage.py seed_attendance --gym 1 --days 45

For each active member and trainer, marks a realistic pattern over the last N days
(mostly present, some absent, lighter on Sundays) with plausible check-in/out
times. Safe to re-run — existing rows are updated, not duplicated.
"""
import datetime
import random
from django.core.management.base import BaseCommand
from apps.gyms.models import Gym
from apps.members.models import Member
from apps.trainers.models import Trainer
from apps.attendance.models import Attendance
from apps.attendance.services import record_punch


class Command(BaseCommand):
    help = 'Seed dummy attendance data for testing.'

    def add_arguments(self, parser):
        parser.add_argument('--gym', type=int, help='Gym id (default: all gyms).')
        parser.add_argument('--days', type=int, default=45, help='How many days back to fill.')
        parser.add_argument('--present-rate', type=float, default=0.75, help='Base chance of being present.')

    def handle(self, *args, **o):
        gyms = Gym.objects.filter(pk=o['gym']) if o['gym'] else Gym.objects.all()
        today = datetime.date.today()
        rows = 0

        for gym in gyms:
            members = list(Member.objects.filter(gym=gym, is_deleted=False))
            trainers = list(Trainer.objects.filter(gym=gym, is_active=True))
            people = [('member', m) for m in members] + [('trainer', t) for t in trainers]
            if not people:
                continue

            for kind, obj in people:
                # Give each person a stable "reliability" so patterns look human.
                reliability = random.uniform(o['present_rate'] - 0.2, o['present_rate'] + 0.2)
                for d in range(o['days']):
                    day = today - datetime.timedelta(days=d)
                    chance = reliability * (0.4 if day.weekday() == 6 else 1.0)  # Sundays quieter
                    if random.random() > chance:
                        continue  # absent that day
                    ci_h = random.randint(6, 11)
                    ci = datetime.datetime.combine(day, datetime.time(ci_h, random.randint(0, 59)))
                    co = ci + datetime.timedelta(hours=random.randint(1, 3), minutes=random.randint(0, 59))
                    record_punch(gym, kind, obj, ci, source=Attendance.Source.DEVICE)
                    record_punch(gym, kind, obj, co, source=Attendance.Source.DEVICE)
                    rows += 1

            self.stdout.write(f'  {gym.name}: {len(members)} members, {len(trainers)} trainers')

        self.stdout.write(self.style.SUCCESS(f'Seeded ~{rows} attendance day-rows.'))
