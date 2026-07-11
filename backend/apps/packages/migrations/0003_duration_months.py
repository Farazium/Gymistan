from django.db import migrations, models


def days_to_months(apps, schema_editor):
    Package = apps.get_model('packages', 'Package')
    for pkg in Package.objects.all():
        pkg.duration_months = max(1, round((pkg.duration_days or 30) / 30))
        pkg.save(update_fields=['duration_months'])


def months_to_days(apps, schema_editor):
    Package = apps.get_model('packages', 'Package')
    for pkg in Package.objects.all():
        pkg.duration_days = (pkg.duration_months or 1) * 30
        pkg.save(update_fields=['duration_days'])


class Migration(migrations.Migration):

    dependencies = [
        ('packages', '0002_package_has_trainer'),
    ]

    operations = [
        migrations.AddField(
            model_name='package',
            name='duration_months',
            field=models.PositiveIntegerField(default=1, help_text='Duration in months'),
        ),
        migrations.RunPython(days_to_months, months_to_days),
        migrations.RemoveField(
            model_name='package',
            name='duration_days',
        ),
    ]
