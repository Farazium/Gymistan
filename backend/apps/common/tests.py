"""What the idempotency middleware promises, held to it.

These use /api/auth/login/ deliberately: it is an unauthenticated POST under
/api/, so the middleware's behaviour can be pinned down without dragging a gym,
a member and a package into every case. The middleware itself never looks at
which endpoint it is wrapping.
"""
import datetime

from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.common.models import IdempotencyRecord
from apps.gyms.models import Gym
from apps.members.models import Member
from apps.packages.models import Package
from apps.payments.models import Payment

LOGIN = '/api/auth/login/'


class IdempotencyMiddlewareTests(TestCase):
    def test_no_key_is_left_alone(self):
        """The whole thing is opt-in: without the header, nothing is recorded."""
        self.client.post(LOGIN, {'email': 'nobody@example.com', 'password': 'x'},
                         content_type='application/json')
        self.assertEqual(IdempotencyRecord.objects.count(), 0)

    def test_safe_method_is_left_alone(self):
        self.client.get('/api/members/', HTTP_IDEMPOTENCY_KEY='k-get')
        self.assertEqual(IdempotencyRecord.objects.count(), 0)

    def test_repeat_replays_the_first_answer(self):
        """The point of the exercise: the same key never does the work twice."""
        body = {'email': 'nobody@example.com', 'password': 'wrong'}
        first = self.client.post(LOGIN, body, content_type='application/json',
                                 HTTP_IDEMPOTENCY_KEY='k-repeat')
        second = self.client.post(LOGIN, body, content_type='application/json',
                                  HTTP_IDEMPOTENCY_KEY='k-repeat')

        self.assertEqual(second.status_code, first.status_code)
        self.assertEqual(second.json(), first.json())
        # The marker is what lets the client tell a replay from a fresh success.
        self.assertIsNone(first.headers.get('Idempotent-Replay'))
        self.assertEqual(second.headers.get('Idempotent-Replay'), 'true')
        self.assertEqual(IdempotencyRecord.objects.filter(key='k-repeat').count(), 1)

    def test_a_rejection_is_remembered_too(self):
        """A 4xx is deterministic, so the queue gets the same complaint back
        rather than a second round trip."""
        self.client.post(LOGIN, {'email': 'nobody@example.com', 'password': 'wrong'},
                         content_type='application/json', HTTP_IDEMPOTENCY_KEY='k-4xx')
        record = IdempotencyRecord.objects.get(key='k-4xx')
        self.assertGreaterEqual(record.status_code, 400)
        self.assertLess(record.status_code, 500)
        self.assertIsNotNone(record.response_body)

    def test_different_keys_are_independent(self):
        for key in ('k-a', 'k-b'):
            self.client.post(LOGIN, {'email': 'nobody@example.com', 'password': 'wrong'},
                             content_type='application/json', HTTP_IDEMPOTENCY_KEY=key)
        self.assertEqual(IdempotencyRecord.objects.count(), 2)

    def test_in_flight_duplicate_is_told_to_wait(self):
        """A row with no status is a request still running. A second attempt must
        be turned away, not allowed to run the write alongside the first."""
        IdempotencyRecord.objects.create(key='k-inflight', method='POST', path=LOGIN)
        response = self.client.post(LOGIN, {'email': 'nobody@example.com', 'password': 'wrong'},
                                    content_type='application/json',
                                    HTTP_IDEMPOTENCY_KEY='k-inflight')
        self.assertEqual(response.status_code, 409)
        self.assertTrue(response.json().get('idempotent_in_progress'))

    def test_oversized_key_is_ignored_not_stored(self):
        """A key too long for the column passes through rather than blowing up
        the write it was meant to protect."""
        self.client.post(LOGIN, {'email': 'nobody@example.com', 'password': 'wrong'},
                         content_type='application/json', HTTP_IDEMPOTENCY_KEY='x' * 300)
        self.assertEqual(IdempotencyRecord.objects.count(), 0)

    def test_success_is_replayed_intact(self):
        """The case that actually protects money: a 2xx replay must hand back the
        same body, so the client can read the created row's id off a retry."""
        User.objects.create_user(email='desk@example.com', password='pw-123456', name='Desk')
        body = {'email': 'desk@example.com', 'password': 'pw-123456'}

        first = self.client.post(LOGIN, body, content_type='application/json',
                                 HTTP_IDEMPOTENCY_KEY='k-ok')
        self.assertEqual(first.status_code, 200)

        second = self.client.post(LOGIN, body, content_type='application/json',
                                  HTTP_IDEMPOTENCY_KEY='k-ok')
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.json(), first.json())
        self.assertEqual(second.headers.get('Idempotent-Replay'), 'true')


class DuplicatePaymentTests(TestCase):
    """The failure this whole mechanism exists to prevent.

    A payment is recorded, the reply is lost, and the queue sends it again. The
    member must be charged once, and their expiry must move once.
    """

    def setUp(self):
        self.gym = Gym.objects.create(name='Test Gym')
        self.user = User.objects.create_user(
            email='desk@example.com', password='pw-123456', name='Desk',
            role=User.Role.GYM_ADMIN, gym=self.gym,
        )
        self.package = Package.objects.create(
            gym=self.gym, name='Monthly', price='3000', duration_months=1,
        )
        self.member = Member.objects.create(
            gym=self.gym, package=self.package, name='Ali', phone='03001234567',
            join_date=datetime.date(2026, 1, 10),
            expiry_date=datetime.date(2026, 9, 10),
        )
        # The API authenticates with JWT only, so Django's session login has no
        # effect here — DRF's own client is the way in.
        self.api = APIClient()
        self.api.force_authenticate(user=self.user)

    def _post_payment(self, key):
        return self.api.post(
            '/api/payments/',
            {
                'member': self.member.id,
                'package': self.package.id,
                'amount': '3000',
                'amount_paid': '3000',
            },
            format='json',
            HTTP_IDEMPOTENCY_KEY=key,
        )

    def test_replayed_payment_charges_once(self):
        first = self._post_payment('pay-key-1')
        self.assertEqual(first.status_code, 201, first.content)

        expiry_after_first = Member.objects.get(pk=self.member.pk).expiry_date

        second = self._post_payment('pay-key-1')

        self.assertEqual(second.status_code, 201)
        self.assertEqual(second.headers.get('Idempotent-Replay'), 'true')
        # Same payment handed back, not a new one — the client reads the id off
        # this and must not end up pointing at a second record.
        self.assertEqual(second.json()['id'], first.json()['id'])
        self.assertEqual(Payment.objects.filter(member=self.member).count(), 1)
        # And the month was bought once.
        self.assertEqual(Member.objects.get(pk=self.member.pk).expiry_date, expiry_after_first)

    def test_a_genuinely_second_payment_still_goes_through(self):
        """The guard must not become a lock: a different key is a different
        payment, and a member renewing twice is allowed to."""
        self.assertEqual(self._post_payment('pay-key-a').status_code, 201)
        self.assertEqual(self._post_payment('pay-key-b').status_code, 201)
        self.assertEqual(Payment.objects.filter(member=self.member).count(), 2)
