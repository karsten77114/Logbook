#!/usr/bin/env python3
"""
Pilot Logbook — Firestore Batch Importer
Imports logbook.json (3,181 records) into Firestore under users/{uid}/flights/{objectId}
Usage:
  FIREBASE_SERVICE_ACCOUNT_KEY=/path/to/service-account.json python3 tools/import_firestore.py
"""

import json
import sys
import os
from pathlib import Path

# ── Config ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR   = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent

SA_KEY_PATH  = Path(os.environ.get('FIREBASE_SERVICE_ACCOUNT_KEY', ''))
JSON_PATH    = PROJECT_ROOT / 'data' / 'logbook.json'
PROJECT_ID   = 'pilot-logbook-ef111'

# ── Get UID from service account or ask user ───────────────────────────────────
# We need the user's UID to write under /users/{uid}/flights/
# The user's Google UID is deterministic from their Google account.
# We'll query Auth to find the user, or let user paste it.

def get_uid_from_auth(auth_client):
    """List users in Firebase Auth and find the one we want."""
    page = auth_client.list_users()
    users = []
    for user in page.users:
        users.append(user)
    return users

def main():
    # ── Import firebase_admin ───────────────────────────────────────────────
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore, auth
    except ImportError:
        print("ERROR: firebase-admin not installed. Run: pip3 install firebase-admin")
        sys.exit(1)

    # ── Init Firebase ───────────────────────────────────────────────────────
    if not os.environ.get('FIREBASE_SERVICE_ACCOUNT_KEY'):
        print("ERROR: FIREBASE_SERVICE_ACCOUNT_KEY is not set.")
        print("Usage: FIREBASE_SERVICE_ACCOUNT_KEY=/path/to/service-account.json python3 tools/import_firestore.py")
        sys.exit(1)

    if not SA_KEY_PATH.exists():
        print(f"ERROR: Service account key not found at:\n  {SA_KEY_PATH}")
        sys.exit(1)

    if not JSON_PATH.exists():
        print(f"ERROR: logbook.json not found at:\n  {JSON_PATH}")
        sys.exit(1)

    print(f"🔑 Using service account key: {SA_KEY_PATH.name}")
    cred = credentials.Certificate(str(SA_KEY_PATH))
    firebase_admin.initialize_app(cred)

    auth_client = auth.Client(firebase_admin.get_app())
    db = firestore.client()

    # ── Find user UID ───────────────────────────────────────────────────────
    print("\n👤 Looking up Firebase Auth users...")
    users = get_uid_from_auth(auth_client)

    if not users:
        print("ERROR: No users found in Firebase Auth. Please sign in to the app first.")
        sys.exit(1)

    if len(users) == 1:
        uid = users[0].uid
        email = users[0].email or '(no email)'
        print(f"   Found 1 user: {email} → uid={uid}")
    else:
        print(f"   Found {len(users)} users:")
        for i, u in enumerate(users):
            print(f"   [{i}] {u.email or '(no email)'} → {u.uid}")
        idx = int(input("   Select user index: ").strip())
        uid = users[idx].uid
        email = users[idx].email

    print(f"\n✅ Importing into: users/{uid}/flights/")

    # ── Load JSON ───────────────────────────────────────────────────────────
    print(f"\n📂 Loading {JSON_PATH.name}...")
    with open(JSON_PATH, 'r', encoding='utf-8') as f:
        records = json.load(f)
    total = len(records)
    print(f"   {total:,} records loaded")

    # ── Batch import ─────────────────────────────────────────────────────────
    col_ref   = db.collection('users').document(uid).collection('flights')
    BATCH_SIZE = 500
    done       = 0
    errors     = 0

    print(f"\n🚀 Starting import ({BATCH_SIZE} records/batch)...\n")

    for start in range(0, total, BATCH_SIZE):
        chunk = records[start : start + BATCH_SIZE]
        batch = db.batch()

        for f in chunk:
            doc_id  = f.get('objectId')
            if not doc_id:
                continue
            doc_ref = col_ref.document(doc_id)
            data = {
                'date':               f.get('date', ''),
                'flightNumber':       f.get('flightNumber', ''),
                'aircraftType':       f.get('aircraftType', ''),
                'registration':       f.get('registration', ''),
                'from':               f.get('from', ''),
                'to':                 f.get('to', ''),
                'outTime':            f.get('outTime', ''),
                'offTime':            f.get('offTime', ''),
                'onTime':             f.get('onTime', ''),
                'inTime':             f.get('inTime', ''),
                'blockTime':          f.get('blockTime', 0),
                'flightTime':         f.get('flightTime', 0),
                'nightTime':          f.get('nightTime', 0),
                'pfTakeoff':          bool(f.get('pfTakeoff', False)),
                'pfLanding':          bool(f.get('pfLanding', False)),
                'pic':                bool(f.get('pic', False)),
                'autoland':           bool(f.get('autoland', False)),
                'goAround':           bool(f.get('goAround', False)),
                'diverted':           bool(f.get('diverted', False)),
                'approachType':       f.get('approachType', ''),
                'runway':             f.get('runway') or f.get('runwayFromNumbers', ''),
                'totalPax':           f.get('totalPax', 0),
                'totalPayload':       f.get('totalPayload', 0),
                'flightPlanDistance': f.get('flightPlanDistance', 0),
                'crew':               f.get('crew', []),
                'crewNames':          f.get('crewNames', []),
            }
            batch.set(doc_ref, data, merge=True)

        try:
            batch.commit()
            done += len(chunk)
            batch_num = start // BATCH_SIZE + 1
            pct = done / total * 100
            bar_len = 30
            filled = int(bar_len * done / total)
            bar = '█' * filled + '░' * (bar_len - filled)
            print(f"  Batch {batch_num:3d} [{bar}] {done:,}/{total:,} ({pct:.1f}%)")
        except Exception as e:
            errors += 1
            print(f"  ✗ Batch {start // BATCH_SIZE + 1} FAILED: {e}")

    print(f"\n{'='*50}")
    if errors == 0:
        print(f"✅ Import complete! {done:,} records written successfully.")
    else:
        print(f"⚠️  Import done: {done:,} success, {errors} batch(es) failed.")
    print(f"{'='*50}")
    print(f"\n🔒 Remember to delete the service account key when done:")
    print(f"   rm '{SA_KEY_PATH}'")

if __name__ == '__main__':
    main()
