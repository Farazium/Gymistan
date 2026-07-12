"""Shared soft-delete behaviour for cashflow records (payments, expenses,
inventory sales).

Policy: a record can be truly removed only within a short grace window after it
was entered (a genuine just-made mistake). After that it is locked into the books
permanently and can never be deleted — this keeps the finance ledger / income
statement reconcilable and gives an audit trail. "Deleting" within the window is a
soft-delete (hidden everywhere, excluded from finance) so it stays recoverable.
"""
from datetime import timedelta
from django.db import models
from django.utils import timezone

# How long after creation a cashflow record may still be deleted.
DELETE_WINDOW = timedelta(hours=24)


class AliveManager(models.Manager):
    """Default manager: hides soft-deleted rows everywhere (finance aggregates,
    list views, reverse relations) without every query having to remember the
    filter. Use `all_objects` when you need deleted rows too."""
    def get_queryset(self):
        return super().get_queryset().filter(is_deleted=False)


class SoftDeleteModel(models.Model):
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)
    deleted_by = models.ForeignKey(
        'accounts.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='+'
    )

    objects = AliveManager()
    all_objects = models.Manager()

    class Meta:
        abstract = True
        # Cascades / integrity checks must see every row, so the base manager is
        # the unfiltered one; only `objects` (the default) hides deleted rows.
        base_manager_name = 'all_objects'

    def within_delete_window(self, now=None):
        """True while the record is still inside its deletable grace window."""
        if not self.created_at:
            return False
        now = now or timezone.now()
        return (now - self.created_at) <= DELETE_WINDOW

    def soft_delete(self, user=None):
        self.is_deleted = True
        self.deleted_at = timezone.now()
        self.deleted_by = user
        self.save(update_fields=['is_deleted', 'deleted_at', 'deleted_by'])
