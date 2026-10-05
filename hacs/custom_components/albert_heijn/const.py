"""Constants for Albert Heijn integration."""

DOMAIN = "albert_heijn"

AH_BASE_URL = "https://api.ah.nl"
CLIENT_ID = "appie"
USER_AGENT = "Appie/8.22.3"
LOGIN_URL = (
    "https://login.ah.nl/secure/oauth/authorize"
    "?client_id=appie&redirect_uri=appie%3A%2F%2Flogin-exit&response_type=code"
)

CONF_REFRESH_TOKEN = "refresh_token"
CONF_ACCESS_TOKEN = "access_token"
CONF_TOKEN_EXPIRES = "token_expires"
CONF_MEMBER_ID = "member_id"
CONF_EMAIL = "email"

UPDATE_INTERVAL_SECONDS = 300
TOKEN_REFRESH_MARGIN_SECONDS = 300

PREMIUM_MEMBERSHIP = "PREMIUM"
