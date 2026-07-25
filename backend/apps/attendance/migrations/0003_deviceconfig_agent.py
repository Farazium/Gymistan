"""Give every gym its own agent credentials.

`agent_token` is unique, so it can't simply be added with a callable default —
Django would run the default once and hand every existing row the same value.
The documented three-step dance instead: add it nullable and non-unique, fill
each row with its own token, then tighten the constraint.
"""
from django.db import migrations, models

# Imported under its own name: the RunPython callback's first argument is also
# called `apps` (the historical registry), which would shadow the package path.
from apps.attendance.models import new_agent_token


def issue_tokens(apps, schema_editor):
    DeviceConfig = apps.get_model('attendance', 'DeviceConfig')
    for cfg in DeviceConfig.objects.filter(agent_token=''):
        cfg.agent_token = new_agent_token()
        cfg.save(update_fields=['agent_token'])


class Migration(migrations.Migration):

    dependencies = [
        ('attendance', '0002_deviceconfig'),
    ]

    operations = [
        migrations.AddField(
            model_name='deviceconfig',
            name='agent_token',
            field=models.CharField(blank=True, default='', max_length=64),
        ),
        migrations.RunPython(issue_tokens, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='deviceconfig',
            name='agent_token',
            field=models.CharField(default=new_agent_token, max_length=64, unique=True),
        ),
        migrations.AddField(
            model_name='deviceconfig',
            name='agent_last_seen',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='deviceconfig',
            name='agent_version',
            field=models.CharField(blank=True, max_length=20),
        ),
        migrations.AddField(
            model_name='deviceconfig',
            name='agent_serial',
            field=models.CharField(blank=True, max_length=64),
        ),
    ]
