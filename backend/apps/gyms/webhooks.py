"""Meta's WhatsApp status webhook.

Sending a message only gets us an id back. Everything worth knowing after that —
did it reach the phone, was it read, did it fail — arrives here, minutes or hours
later, and is matched onto the WhatsAppUsage row by that id.

Worth being clear about what this cannot tell you: Meta never reports that someone
blocked you. A block and a switched-off phone produce exactly the same thing — a
message that stops at SENT and never turns DELIVERED. So the signal is statistical,
not per-message: a recipient with several sends all stuck at SENT is probably a
block, and a gym whose members do that at a much higher rate than the rest is
probably why the shared number's quality rating is dropping.
"""
import hashlib
import hmac
import json
import logging
from datetime import datetime, timezone as dt_timezone

from django.conf import settings
from django.db import transaction
from django.http import HttpResponse, HttpResponseForbidden, JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from .credits import refund_wa_credit
from .models import WhatsAppUsage

logger = logging.getLogger(__name__)

# Meta's status strings -> ours.
STATUS_MAP = {
    'sent': WhatsAppUsage.Status.SENT,
    'delivered': WhatsAppUsage.Status.DELIVERED,
    'read': WhatsAppUsage.Status.READ,
    'failed': WhatsAppUsage.Status.FAILED,
}


def _valid_signature(request):
    """Check Meta's X-Hub-Signature-256 against the raw body.

    This endpoint is unauthenticated and public, so without this check anyone who
    learns the URL can post fabricated statuses — including `failed`, which refunds
    a credit. Unset app secret means unverified: fine on a dev tunnel, which is why
    it is allowed, but it must be set in production."""
    secret = getattr(settings, 'WHATSAPP_APP_SECRET', '')
    if not secret:
        logger.warning('WHATSAPP_APP_SECRET is not set — webhook payloads are unverified')
        return True
    header = request.headers.get('X-Hub-Signature-256', '')
    if not header.startswith('sha256='):
        return False
    expected = hmac.new(secret.encode(), request.body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header[len('sha256='):])


def _ts(value):
    """Meta sends unix seconds as a string. Fall back to now rather than lose the row."""
    try:
        return datetime.fromtimestamp(int(value), tz=dt_timezone.utc)
    except (TypeError, ValueError):
        return timezone.now()


def _first_error(status):
    errors = status.get('errors') or []
    if not errors:
        return '', ''
    err = errors[0]
    detail = err.get('message') or err.get('title') or ''
    return str(err.get('code', ''))[:20], detail


@transaction.atomic
def _apply_status(status):
    """Fold one status update onto its usage row. Returns True if it changed."""
    wamid = status.get('id')
    mapped = STATUS_MAP.get(status.get('status'))
    if not wamid or not mapped:
        return False

    # Locked because Meta retries, and a retry racing the original would otherwise
    # let both see the pre-FAILED row and refund the same credit twice.
    usage = WhatsAppUsage.objects.select_for_update().filter(wamid=wamid).first()
    if usage is None:
        # A status for a message we have no row for: sends made before this tracking
        # existed, or from another environment pointed at the same number.
        return False
    if not usage.advance_to(mapped):
        return False

    when = _ts(status.get('timestamp'))
    fields = ['status']
    if mapped == WhatsAppUsage.Status.DELIVERED:
        usage.delivered_at = when
        fields.append('delivered_at')
    elif mapped == WhatsAppUsage.Status.READ:
        usage.read_at = when
        fields.append('read_at')
    elif mapped == WhatsAppUsage.Status.FAILED:
        usage.failed_at = when
        usage.error_code, usage.error_detail = _first_error(status)
        fields += ['failed_at', 'error_code', 'error_detail']
        # Meta bills on delivery, so an undelivered message cost the gym nothing and
        # its reserved credit goes back. advance_to() has already established this is
        # the first time this row reached FAILED, so the refund cannot double up.
        refund_wa_credit(usage.gym)

    usage.save(update_fields=fields)
    return True


@csrf_exempt
@require_http_methods(['GET', 'POST'])
def whatsapp_webhook(request):
    """Meta calls GET once to verify the URL, then POSTs every status change."""
    if request.method == 'GET':
        token = getattr(settings, 'WHATSAPP_VERIFY_TOKEN', '')
        if (request.GET.get('hub.mode') == 'subscribe'
                and token and request.GET.get('hub.verify_token') == token):
            return HttpResponse(request.GET.get('hub.challenge', ''),
                                content_type='text/plain')
        return HttpResponseForbidden('verification failed')

    if not _valid_signature(request):
        return HttpResponseForbidden('bad signature')

    try:
        body = json.loads(request.body or b'{}')
    except ValueError:
        # Still 200: Meta retries anything else, and a body we can't parse now will
        # not parse on the retry either.
        logger.warning('WhatsApp webhook: unparseable body')
        return JsonResponse({'ok': True})

    for entry in body.get('entry') or []:
        for change in entry.get('changes') or []:
            for status in (change.get('value') or {}).get('statuses') or []:
                try:
                    _apply_status(status)
                except Exception:
                    # One bad status must not cost us the rest of the batch, and
                    # raising would only earn a retry of the whole thing.
                    logger.exception('WhatsApp webhook: failed to apply status')

    return JsonResponse({'ok': True})
