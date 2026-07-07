from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('expenses', '0003_expense_trainer'),
    ]

    operations = [
        migrations.AlterField(
            model_name='expense',
            name='category',
            field=models.CharField(choices=[('RENT', 'Rent'), ('UTILITIES', 'Utilities'), ('BILLS', 'Bills'), ('SALARIES', 'Salaries'), ('EQUIPMENT', 'Equipment'), ('MAINTENANCE', 'Maintenance'), ('MARKETING', 'Marketing'), ('INVENTORY', 'Inventory'), ('OTHER', 'Other')], default='OTHER', max_length=20),
        ),
    ]
