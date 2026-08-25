import os

# Tests hardcode "/api/v1/..." paths, independent of whatever API_PREFIX a
# developer's local .env happens to use — pin it before app.core.config
# ever loads settings (this file is imported before any test module).
os.environ["APP_ENV"] = "test"
os.environ["API_PREFIX"] = "/api/v1"

# Blank SMTP host makes mail.py log instead of connecting (see its comment). Without
# this the suite sends real mail through whatever's in .env — it was quietly emailing
# a live Gmail account on every run until that hit its daily sending limit and started
# failing tests. Tests should never reach the network.
os.environ["SMTP_HOST"] = ""
