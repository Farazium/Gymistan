"""
Run this once to create the superadmin account:
  python seed.py
"""
import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.accounts.models import User

if not User.objects.filter(email='admin@gymsaas.com').exists():
    User.objects.create_superuser(
        email='admin@gymsaas.com',
        password='Admin@1234',
        name='Super Admin',
    )
    print('Superadmin created: admin@gymsaas.com / Admin@1234')
else:
    print('Superadmin already exists.')
