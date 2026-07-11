from django.db import models


class Tier(models.TextChoices):
    # Labels mirror the product names shown in the frontend (Starter / Connect /
    # Track / Elite) so admin and UI stay consistent.
    TIER1    = 'TIER1',    'Starter'
    TIER2_WA = 'TIER2_WA', 'Connect'
    TIER2_AT = 'TIER2_AT', 'Track'
    TIER3    = 'TIER3',    'Elite'


class ThemeColor(models.TextChoices):
    ROSE    = 'rose',    'Rose'
    RED     = 'red',     'Red'
    ORANGE  = 'orange',  'Orange'
    AMBER   = 'amber',   'Amber'
    YELLOW  = 'yellow',  'Yellow'
    LIME    = 'lime',    'Lime'
    GREEN   = 'green',   'Green'
    EMERALD = 'emerald', 'Emerald'
    TEAL    = 'teal',    'Teal'
    CYAN    = 'cyan',    'Cyan'
    SKY     = 'sky',     'Sky'
    BLUE    = 'blue',    'Blue'
    INDIGO  = 'indigo',  'Indigo'
    VIOLET  = 'violet',  'Violet'
    PURPLE  = 'purple',  'Purple'
    FUCHSIA = 'fuchsia', 'Fuchsia'
    PINK    = 'pink',    'Pink'


class CardColor(models.TextChoices):
    SLATE    = 'slate',    'Slate'
    GRAPHITE = 'graphite', 'Graphite'
    MIDNIGHT = 'midnight', 'Midnight'
    NAVY     = 'navy',     'Navy'
    INDIGO   = 'indigo',   'Indigo'
    OCEAN    = 'ocean',    'Ocean'
    FOREST   = 'forest',   'Forest'
    STONE    = 'stone',    'Stone'
    BRONZE   = 'bronze',   'Bronze'
    PLUM     = 'plum',     'Plum'
    WINE     = 'wine',     'Wine'


class Gym(models.Model):
    name = models.CharField(max_length=200)
    address = models.TextField(blank=True)
    phone = models.CharField(max_length=20, blank=True)
    logo = models.ImageField(upload_to='gym_logos/', null=True, blank=True)
    is_active = models.BooleanField(default=True)
    joining_date = models.DateField(null=True, blank=True)
    expiry_date = models.DateField(null=True, blank=True)
    subscription_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    tier = models.CharField(max_length=20, choices=Tier.choices, default=Tier.TIER1)
    theme_color = models.CharField(max_length=20, choices=ThemeColor.choices, default=ThemeColor.BLUE)
    card_color = models.CharField(max_length=20, choices=CardColor.choices, default=CardColor.SLATE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'gyms'

    def __str__(self):
        return self.name


class GymPayment(models.Model):
    METHODS = [('CASH', 'Cash'), ('ONLINE', 'Online')]

    gym = models.ForeignKey(Gym, on_delete=models.CASCADE, related_name='gym_payments')
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    months = models.PositiveIntegerField(default=1)
    payment_date = models.DateField()
    payment_method = models.CharField(max_length=20, choices=METHODS, default='CASH')
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'gym_payments'
        ordering = ['-payment_date', '-created_at']

    def __str__(self):
        return f'{self.gym.name} – {self.amount}'
