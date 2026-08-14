import os
from pathlib import Path
from dotenv import load_dotenv
from datetime import timedelta

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.getenv('SECRET_KEY', 'change-me-in-production')
DEBUG = os.getenv('DEBUG', 'True') == 'True'
ALLOWED_HOSTS = os.getenv('ALLOWED_HOSTS', 'localhost').split(',')

# Origins Django accepts CSRF-protected POSTs from (admin login, form posts). Must be
# full scheme+host entries, e.g. https://gymistan.dev — required once served over HTTPS.
CSRF_TRUSTED_ORIGINS = [o for o in os.getenv('CSRF_TRUSTED_ORIGINS', '').split(',') if o]

DJANGO_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
]

THIRD_PARTY_APPS = [
    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',
    'django_filters',
]

LOCAL_APPS = [
    # Shared behaviour with a table of its own (the idempotency ledger), so it
    # has to be installed rather than merely imported.
    'apps.common',
    'apps.accounts',
    'apps.gyms',
    'apps.members',
    'apps.packages',
    'apps.payments',
    'apps.expenses',
    'apps.dashboard',
    'apps.inventory',
    'apps.trainers',
    'apps.attendance',
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    # Last, so it wraps the view as closely as possible: what it records is the
    # response the view produced, and what it must not record is some other
    # middleware's error page.
    'apps.common.idempotency.IdempotencyMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.getenv('DB_NAME', 'gym_saas'),
        'USER': os.getenv('DB_USER', 'postgres'),
        'PASSWORD': os.getenv('DB_PASSWORD', ''),
        'HOST': os.getenv('DB_HOST', 'localhost'),
        'PORT': os.getenv('DB_PORT', '5432'),
    }
}

AUTH_USER_MODEL = 'accounts.User'

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_FILTER_BACKENDS': (
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ),
    # NO default pagination — deliberately.
    #
    # This used to be PageNumberPagination with PAGE_SIZE 20, which silently
    # truncated every list in the app: a gym with 40 payments saw only the 20
    # newest, and nothing in the UI said so. Searching appeared to "find" the
    # missing rows because the server filters before it paginates, so an older
    # payment could surface in a search yet be invisible in the list.
    #
    # The screens these endpoints feed are whole-dataset views — they filter and
    # sort client-side, total the rows, and export them to Excel — so a page of
    # 20 doesn't just hide records, it makes the totals and the exports wrong.
    # There is no page-2 control anywhere in the frontend to reach the rest.
    #
    # If a gym ever grows a list big enough for the payload to hurt (payments is
    # the one that grows), the fix is a real date/period filter on that screen —
    # not a page size that quietly drops rows.
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(days=7),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=30),
    'ROTATE_REFRESH_TOKENS': True,
}

CORS_ALLOWED_ORIGINS = [
    os.getenv('FRONTEND_URL', 'http://localhost:5173'),
]
CORS_ALLOW_CREDENTIALS = True

# The frontend stamps every write with this so a retry can't charge a member
# twice (apps/common/idempotency.py). It is a custom header, so the browser will
# not send it cross-origin unless the preflight says it may.
from corsheaders.defaults import default_headers  # noqa: E402
CORS_ALLOW_HEADERS = list(default_headers) + ['idempotency-key']
# ...and the reply's marker is invisible to JS cross-origin unless exposed.
CORS_EXPOSE_HEADERS = ['Idempotent-Replay']

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Asia/Karachi'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# nginx terminates TLS and forwards plain HTTP upstream, so Django only learns the
# original scheme from this header — without it request.is_secure() is always False.
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

# Cookies go HTTPS-only in production. Kept env-overridable so the site can still be
# exercised over plain HTTP (bare server IP) before the certificate is issued.
SESSION_COOKIE_SECURE = os.getenv('SECURE_COOKIES', str(not DEBUG)) == 'True'
CSRF_COOKIE_SECURE = SESSION_COOKIE_SECURE

WHATSAPP_TOKEN = os.getenv('WHATSAPP_TOKEN', '')
WHATSAPP_PHONE_NUMBER_ID = os.getenv('WHATSAPP_PHONE_NUMBER_ID', '')
WHATSAPP_WABA_ID = os.getenv('WHATSAPP_WABA_ID', '')
WHATSAPP_TEMPLATE_NAME = os.getenv('WHATSAPP_TEMPLATE_NAME', 'payment_receipt_v2')
WHATSAPP_WELCOME_TEMPLATE_NAME = os.getenv('WHATSAPP_WELCOME_TEMPLATE_NAME', 'member_welcome')
WHATSAPP_REMINDER_TEMPLATE_NAME = os.getenv('WHATSAPP_REMINDER_TEMPLATE_NAME', 'membership_expiry_notice')
# The same notice for someone whose membership has already run out. A separate
# template because the tense is the whole message: telling a lapsed member their
# membership is "scheduled to end" on a date that has passed reads as a mistake.
WHATSAPP_EXPIRED_TEMPLATE_NAME = os.getenv('WHATSAPP_EXPIRED_TEMPLATE_NAME', 'membership_expired_notice')
WHATSAPP_DUES_TEMPLATE_NAME = os.getenv('WHATSAPP_DUES_TEMPLATE_NAME', 'fee_balance_notice')
WHATSAPP_TEMPLATE_LANG = os.getenv('WHATSAPP_TEMPLATE_LANG', 'en_US')
WHATSAPP_API_VERSION = os.getenv('WHATSAPP_API_VERSION', 'v22.0')
# Status webhook. VERIFY_TOKEN is any string we choose — Meta echoes it back on the
# one-time GET handshake. APP_SECRET is the Meta app's secret and signs every POST;
# without it the endpoint accepts unsigned payloads, so it must be set in production.
WHATSAPP_VERIFY_TOKEN = os.getenv('WHATSAPP_VERIFY_TOKEN', '')
WHATSAPP_APP_SECRET = os.getenv('WHATSAPP_APP_SECRET', '')
