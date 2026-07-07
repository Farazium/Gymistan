"""Pull attendance punches from ZKTeco device(s) into the database.

    python manage.py sync_zkteco --all          # every gym with a configured device
    python manage.py sync_zkteco --gym 1        # one gym, using its saved DeviceConfig
    python manage.py sync_zkteco --gym 1 --ip 192.168.1.201   # override / ad-hoc

Run on a schedule (Windows Task Scheduler in dev, cron/Celery in prod). Uses each
device's saved watermark so only new punches are applied. Requires `pip install
pyzk` and network access to the device.
"""
from django.utils import timezone
from django.core.management.base import BaseCommand, CommandError
from apps.gyms.models import Gym
from apps.attendance.models import DeviceConfig
from apps.attendance.zk_service import sync_device


class Command(BaseCommand):
    help = 'Sync attendance from ZKTeco biometric device(s).'

    def add_arguments(self, parser):
        parser.add_argument('--all', action='store_true', help='Sync all configured active devices.')
        parser.add_argument('--gym', type=int, help='Gym id to sync.')
        parser.add_argument('--ip', help='Override device IP (else uses saved config).')
        parser.add_argument('--port', type=int)
        parser.add_argument('--timeout', type=int, default=10)

    def handle(self, *args, **o):
        if o['all']:
            configs = DeviceConfig.objects.filter(is_active=True).exclude(ip='')
            if not configs:
                self.stdout.write('No active devices configured.')
            for cfg in configs:
                self._sync_cfg(cfg)
            return

        if not o['gym']:
            raise CommandError('Provide --all or --gym <id>.')
        try:
            gym = Gym.objects.get(pk=o['gym'])
        except Gym.DoesNotExist:
            raise CommandError(f"Gym {o['gym']} not found")
        cfg, _ = DeviceConfig.objects.get_or_create(gym=gym)
        if o['ip']:
            cfg.ip = o['ip']
        if o['port']:
            cfg.port = o['port']
        if not cfg.ip:
            raise CommandError('No device IP (configure it in the app or pass --ip).')
        self._sync_cfg(cfg, timeout=o['timeout'])

    def _sync_cfg(self, cfg, timeout=10):
        self.stdout.write(f'Syncing {cfg.gym.name} @ {cfg.ip}:{cfg.port} ...')
        cfg.last_sync_at = timezone.now()
        try:
            s = sync_device(cfg.gym, cfg.ip, port=cfg.port, timeout=timeout,
                            password=cfg.password, since=cfg.last_sync)
        except Exception as e:
            cfg.last_sync_status = f'Failed: {e}'[:255]
            cfg.save(update_fields=['last_sync_at', 'last_sync_status'])
            self.stdout.write(self.style.ERROR(f'  {e}'))
            return
        if s.get('latest'):
            cfg.last_sync = s['latest']
        cfg.last_sync_count = s['applied']
        cfg.last_sync_status = f"OK — {s['applied']} new ({s['skipped_unknown']} unknown)"
        cfg.save()
        self.stdout.write(self.style.SUCCESS(
            f"  pulled {s['pulled']}, applied {s['applied']}, "
            f"unknown {s['skipped_unknown']}, old-skipped {s['skipped_old']}"))
