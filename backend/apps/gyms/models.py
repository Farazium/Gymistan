from decimal import Decimal
from django.db import models
from django.utils import timezone


class Tier(models.TextChoices):
    # Labels mirror the product names shown in the frontend (Starter / Connect /
    # Track / Elite) so admin and UI stay consistent.
    TIER1    = 'TIER1',    'Starter'
    TIER2_WA = 'TIER2_WA', 'Connect'
    TIER2_AT = 'TIER2_AT', 'Track'
    TIER3    = 'TIER3',    'Elite'


# Tiers that include WhatsApp messaging. Mirrored by the frontend tier checks.
WA_TIERS = (Tier.TIER2_WA, Tier.TIER3)


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
    # What this gym is billed per delivered WhatsApp message (PKR). Meta charges us
    # ~2.8; the margin is the SaaS markup. Editable per gym from the superadmin side.
    whatsapp_rate = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal('4.60'))
    # Prepaid WhatsApp credits. Messages are bought up front: a top-up sets
    # wa_allowance to (whatever was left + what was bought) and resets wa_used to 0,
    # so the gym reads its balance as wa_used/wa_allowance. Sending is blocked once
    # they meet. Never write these directly — go through topup()/reserve_wa_credit()
    # so the counters stay consistent with the WhatsAppTopup ledger.
    wa_allowance = models.PositiveIntegerField(default=0)
    wa_used = models.PositiveIntegerField(default=0)
    theme_color = models.CharField(max_length=20, choices=ThemeColor.choices, default=ThemeColor.BLUE)
    card_color = models.CharField(max_length=20, choices=CardColor.choices, default=CardColor.SLATE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'gyms'

    def __str__(self):
        return self.name

    @property
    def wa_remaining(self):
        return max(self.wa_allowance - self.wa_used, 0)

    @property
    def wa_percent_used(self):
        """0–100. A gym with no credits at all reads as 100% (fully exhausted)."""
        if not self.wa_allowance:
            return 100
        return min(round(self.wa_used * 100 / self.wa_allowance), 100)

    @property
    def wa_exhausted(self):
        return self.wa_remaining <= 0


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


class WhatsAppUsage(models.Model):
    """One row per WhatsApp message we successfully sent on a gym's behalf — the
    audit trail behind Gym.wa_used."""

    class Category(models.TextChoices):
        RECEIPT  = 'RECEIPT',  'Receipt'
        WELCOME  = 'WELCOME',  'Welcome'
        REMINDER = 'REMINDER', 'Reminder'

    gym = models.ForeignKey(Gym, on_delete=models.CASCADE, related_name='wa_usages')
    category = models.CharField(max_length=20, choices=Category.choices)
    sent_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'whatsapp_usages'
        ordering = ['-sent_at']
        indexes = [models.Index(fields=['gym', 'sent_at'])]

    def __str__(self):
        return f'{self.gym.name} · {self.category} · {self.sent_at:%Y-%m-%d}'


class WhatsAppTopup(models.Model):
    """One row per prepaid message pack a gym bought. Also the audit trail for
    Gym.wa_allowance / wa_used: each row snapshots what the balance became, so a
    disputed balance can be replayed from history."""

    gym = models.ForeignKey(Gym, on_delete=models.CASCADE, related_name='wa_topups')
    messages = models.PositiveIntegerField()          # bought this time
    carried_over = models.PositiveIntegerField(default=0)   # unused credits rolled in
    allowance_after = models.PositiveIntegerField()    # = carried_over + messages
    rate = models.DecimalField(max_digits=6, decimal_places=2)   # snapshot at purchase
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL,
                                   null=True, blank=True, related_name='wa_topups')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'whatsapp_topups'
        ordering = ['-created_at']
        indexes = [models.Index(fields=['gym', '-created_at'])]

    def __str__(self):
        return f'{self.gym.name} · +{self.messages} msgs · PKR {self.amount}'
