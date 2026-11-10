"""Generate a 6-digit code per voter, store only its hash in Supabase, email the code.
Usage: python send_codes.py voters.csv      (CSV with an 'email' column)
Env:   SUPABASE_URL, SUPABASE_SERVICE_KEY, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
Codes are never written to disk or logged. Re-running ADDS a fresh code; any earlier codes keep working.
Emails matching no batch (ug2026 / mds2025) are skipped."""
import csv, os, secrets, smtplib, sys, requests
from email.message import EmailMessage
from dotenv import load_dotenv

load_dotenv()

URL, KEY = os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"]
SMTP_USER = os.environ["SMTP_USER"]

def register(email, code):
    r = requests.post(f"{URL}/rest/v1/rpc/register_voter",
        headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"},
        json={"p_email": email, "p_code": code}, timeout=20)
    r.raise_for_status()
    return r.json()  # False if email matches no batch

def mail(smtp, email, code):
    m = EmailMessage()
    m["Subject"], m["From"], m["To"] = "Your campus election voter code", SMTP_USER, email
    m.set_content(f"Your voter code: {code}\n\nKeep it secret. On election day, enter this "
                  f"code and this email address on the voting website. It works once.\n"
                  f"If you received an earlier code, that one still works too.")
    smtp.send_message(m)

with open(sys.argv[1], newline="") as f:
    emails = [r["email"].strip().lower() for r in csv.DictReader(f) if r["email"].strip()]

with smtplib.SMTP(os.environ["SMTP_HOST"], int(os.environ.get("SMTP_PORT", 587))) as smtp:
    smtp.starttls(); smtp.login(SMTP_USER, os.environ["SMTP_PASS"])
    for e in dict.fromkeys(emails):
        code = f"{secrets.randbelow(10**6):06d}"
        try:
            if register(e, code): mail(smtp, e, code); print("sent   ", e)
            else: print("skipped", e, "(email matches no batch)")
        except Exception as ex:
            print("FAILED ", e, ex)   # fix & re-run; a failed email after registering needs manual reset
