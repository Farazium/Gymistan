"""Make a repeated write harmless.

A client that never saw a reply cannot know whether its write landed, so the
offline queue re-sends it. Every write it sends carries an `Idempotency-Key`
header it generated before the first attempt and keeps across retries; this
middleware makes the second and every later attempt return the first attempt's
answer instead of doing the work again.

What is and isn't remembered:

* 2xx — remembered. This is the case that matters: the payment exists, and the
  retry must be handed the same payment (same id) rather than making another.
* 4xx — remembered too. A rejected write is rejected deterministically, so
  replaying it can only waste a round trip and produce the same complaint. The
  queue needs that complaint back so it can show the desk what was wrong.
* 5xx, or an exception — forgotten. Something broke on our side and may well not
  break next time, so the key is released and the retry is allowed to try for
  real.

Scope: only unsafe methods, only under /api/, and only when the client actually
sent a key. Everything else passes straight through — this is opt-in from the
client's side, which keeps it out of the way of the parts of the app that never
go through the queue.
"""
import json
import logging

from django.db import IntegrityError, transaction
from django.http import JsonResponse

logger = logging.getLogger(__name__)

HEADER = 'HTTP_IDEMPOTENCY_KEY'
UNSAFE_METHODS = frozenset({'POST', 'PUT', 'PATCH', 'DELETE'})
MAX_KEY_LENGTH = 100

# Returned to a second attempt that arrives while the first is still running.
# 409 rather than a wait: the queue is serial, so this only happens if two tabs
# replay at once, and the right answer is "back off and ask again".
IN_PROGRESS_STATUS = 409
IN_PROGRESS_BODY = {
    'detail': 'This request is already being processed. Retry in a moment.',
    'idempotent_in_progress': True,
}


def _body_of(response):
    """The response payload as something JSONField can hold, or None.

    DRF hands us `.data` before rendering, which is already plain Python. A
    non-DRF response (a PDF, a redirect) has no such thing and is not something
    we can replay, so it is stored as None and the retry simply re-runs — none
    of those routes are queueable anyway.
    """
    data = getattr(response, 'data', None)
    if data is None:
        return None
    try:
        # Round-trip through the JSON encoder now, while there is a request to
        # blame if it fails, rather than at save() time inside a broad except.
        return json.loads(json.dumps(data, default=str))
    except (TypeError, ValueError):
        return None


class IdempotencyMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        key = request.META.get(HEADER, '').strip()

        if (
            not key
            or len(key) > MAX_KEY_LENGTH
            or request.method not in UNSAFE_METHODS
            or not request.path.startswith('/api/')
        ):
            return self.get_response(request)

        # Imported here so the module can be imported from settings without
        # dragging the app registry in before it is ready.
        from .models import IdempotencyRecord

        try:
            # The unique constraint on `key` is the lock: whoever manages to
            # insert the row owns the write, and everyone else is a duplicate.
            # Its own transaction, so losing the race doesn't poison the
            # surrounding one on Postgres.
            with transaction.atomic():
                record = IdempotencyRecord.objects.create(
                    key=key,
                    method=request.method,
                    path=request.path[:255],
                )
        except IntegrityError:
            return self._replay(key)

        try:
            response = self.get_response(request)
        except Exception:
            # The write may or may not have half-happened, but holding the key
            # would strand the client with no way to ever complete it. Release
            # it and let the retry decide.
            IdempotencyRecord.objects.filter(pk=record.pk).delete()
            raise

        if response.status_code >= 500:
            IdempotencyRecord.objects.filter(pk=record.pk).delete()
            return response

        record.status_code = response.status_code
        record.response_body = _body_of(response)
        # Attribution is only possible after the view has run — authentication is
        # DRF's job, not the middleware's, so `request.user` is not populated on
        # the way in.
        user = getattr(request, 'user', None)
        record.user = user if getattr(user, 'is_authenticated', False) else None
        record.save(update_fields=['status_code', 'response_body', 'user'])
        return response

    def _replay(self, key):
        from .models import IdempotencyRecord

        record = IdempotencyRecord.objects.filter(key=key).first()
        if record is None:
            # Deleted between the failed insert and this read — the first attempt
            # errored and released the key. Tell the client to try again.
            return JsonResponse(IN_PROGRESS_BODY, status=IN_PROGRESS_STATUS)

        if record.status_code is None:
            return JsonResponse(IN_PROGRESS_BODY, status=IN_PROGRESS_STATUS)

        logger.info('Idempotent replay of %s %s (key %s)', record.method, record.path, key[:12])
        response = JsonResponse(
            record.response_body if record.response_body is not None else {},
            status=record.status_code,
            safe=False,
        )
        # Lets the client tell "this was already done" from "this just happened" —
        # useful when deciding whether to celebrate at the desk.
        response['Idempotent-Replay'] = 'true'
        return response
