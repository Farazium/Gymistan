"""Shared model behaviour: soft-delete for cashflow records, and the
once-and-only-once record that makes a retried write safe.

Soft-delete policy: a record can be truly removed only within a short grace window after it
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


class IdempotencyRecord(models.Model):
    """One row per write the client has claimed, so a retry can never do it twice.

    The problem this exists for is specific and expensive. The desk records a
    payment; the request reaches the server and the payment is created; the reply
    is lost on the way back (the line drops, the phone hotspot stalls, the tab is
    closed). The client never saw a success, so it sends the write again — and
    the member is charged twice, their expiry moves forward twice, and the books
    show money that was never handed over. No amount of care on the client can
    fix that: from out there, "the reply was lost" and "the request never
    arrived" look identical.

    So the client stamps every write with a key it generated itself, and the
    server promises that a key it has already seen produces the *original*
    answer rather than a second payment. See apps/common/idempotency.py.

    The stored response is the whole point: replaying has to return what the
    first attempt returned, including the created row's id, or the client cannot
    tell a successful retry from a failure.
    """
    key = models.CharField(max_length=100, unique=True)
    user = models.ForeignKey(
        'accounts.User', on_delete=models.CASCADE, null=True, blank=True, related_name='+'
    )
    method = models.CharField(max_length=10)
    path = models.CharField(max_length=255)
    # Null while the request is still being handled. A second attempt that finds
    # a row in this state is a genuine concurrent duplicate and is told to wait,
    # rather than being allowed to run the write alongside the first one.
    status_code = models.IntegerField(null=True, blank=True)
    response_body = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'idempotency_records'
        ordering = ['-created_at']
        indexes = [models.Index(fields=['created_at'])]

    def __str__(self):
        return f'{self.method} {self.path} [{self.key[:12]}…] -> {self.status_code}'
