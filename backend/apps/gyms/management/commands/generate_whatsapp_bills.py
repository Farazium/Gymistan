"""Close out any completed WhatsApp billing cycles into WhatsAppBills for every gym.

Bills are also generated lazily on read, so this is only needed if you want bills
to appear without anyone opening the billing pages (e.g. a daily cron).
"""
from django.core.management.base import BaseCommand

from apps.gyms.models import Gym
from apps.gyms import billing


class Command(BaseCommand):
    help = 'Generate WhatsApp usage bills for all gyms whose cycles have closed.'

    def handle(self, *args, **options):
        for gym in Gym.objects.all():
            before = gym.wa_bills.count()
            billing.ensure_bills(gym)
            added = gym.wa_bills.count() - before
            if added:
                self.stdout.write(self.style.SUCCESS(f'{gym.name}: +{added} bill(s)'))
        self.stdout.write('Done.')
