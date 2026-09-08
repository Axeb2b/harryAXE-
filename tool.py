import os
import sys
import base64
import requests
from datetime import datetime
##Tool and API by @honeybadger_xy (https://t.me/+FC14prs60rE5Mjll)
API_BASE = "https://honeybadger-aadharapi.vercel.app"
API_KEY = "Badger-Cartel-Free"   # will be set from command line or input
TIMEOUT = 180

def api_post(endpoint, data):
    url = f"{API_BASE}{endpoint}"
    headers = {"Authorization": f"Bearer {API_KEY}"}
    print(f"⏳ Sending request to {endpoint}...")
    resp = requests.post(url, json=data, headers=headers, timeout=TIMEOUT)
    if resp.status_code == 401:
        raise Exception("Unauthorized: Invalid or missing API key")
    if resp.status_code != 200:
        raise Exception(f"HTTP {resp.status_code}: {resp.text[:200]}")
    return resp.json()

def download_pdf_from_api(session_id, otp, name, eid):
    url = f"{API_BASE}/api/download"
    headers = {"Authorization": f"Bearer {API_KEY}"}
    print("⏳ Waiting for PDF response (can take up to 2 minutes)...")
    resp = requests.post(url, json={"session_id": session_id, "otp": otp}, headers=headers, timeout=TIMEOUT)
    if resp.status_code != 200:
        raise Exception(f"Download failed: HTTP {resp.status_code} - {resp.text[:200]}")
    if "application/json" in resp.headers.get("content-type", ""):
        data = resp.json()
        if not data.get("success"):
            raise Exception(data.get("error", "Unknown error"))
        pdf_base64 = data.get("pdfBase64")
        if not pdf_base64:
            raise Exception("PDF data missing in response")
        pdf_bytes = base64.b64decode(pdf_base64)
        password = data.get("password")
    else:
        pdf_bytes = resp.content
        password = resp.headers.get("X-PDF-Password")
    safe_name = "".join(c for c in name if c.isalnum() or c == " ").strip() or "Aadhaar"
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{safe_name}_{eid}_{ts}.pdf"
    with open(filename, "wb") as f:
        f.write(pdf_bytes)
    return os.path.abspath(filename), password

def main():
    global API_KEY
    print("\n=== AADHAAR DOWNLOAD TOOL ===\n")

    # Get API key from command line or prompt
    if len(sys.argv) > 1:
        API_KEY = sys.argv[1]
        print(f"✅ Using API key from command line: {API_KEY[:4]}...")
    else:
        API_KEY = input("Enter your API key: ").strip()
        if not API_KEY:
            print("❌ API key required.")
            sys.exit(1)

    mobile = input("Enter 10-digit mobile number: ").strip()
    if not mobile.isdigit() or len(mobile) != 10:
        print("❌ Invalid mobile number.")
        sys.exit(1)

    name = input("Enter name (press Enter for 'MR'): ").strip()
    if not name:
        name = "MR"

    print("\n🔄 Initiating OTP request...")
    init_resp = api_post("/api/initiate", {"mobile": mobile, "name": name})
    if not init_resp.get("success"):
        print(f"❌ Initiation failed: {init_resp.get('error')}")
        sys.exit(1)
    session_id = init_resp["session_id"]
    print(f"✅ Session ID: {session_id}")
    print("📱 OTP sent to your mobile.")

    otp = input("\nEnter the OTP received: ").strip()
    if not otp.isdigit() or len(otp) != 6:
        print("❌ OTP must be 6 digits.")
        sys.exit(1)

    print("\n🔄 Verifying OTP...")
    verify_resp = api_post("/api/verify", {"session_id": session_id, "otp": otp})
    if not verify_resp.get("success"):
        print(f"❌ Verification failed: {verify_resp.get('error')}")
        sys.exit(1)
    eid = verify_resp["eid"]
    name_retrieved = verify_resp.get("name", name)
    dob = verify_resp.get("dob", "")
    print(f"✅ EID: {eid}")
    print(f"✅ Name: {name_retrieved}")
    print(f"✅ DOB: {dob}")

    print("\n🔄 Requesting download OTP...")
    dl_req_resp = api_post("/api/send-download-otp", {"session_id": session_id})
    if not dl_req_resp.get("success"):
        print(f"❌ Download OTP request failed: {dl_req_resp.get('error')}")
        sys.exit(1)
    print("📱 Download OTP sent to your mobile.")

    dl_otp = input("\nEnter the download OTP: ").strip()
    if not dl_otp.isdigit() or len(dl_otp) != 6:
        print("❌ OTP must be 6 digits.")
        sys.exit(1)

    print("\n📥 Downloading PDF...")
    try:
        pdf_path, password = download_pdf_from_api(session_id, dl_otp, name_retrieved, eid)
        print(f"\n✅ PDF saved as: {pdf_path}")
        if password:
            print(f"🔑 PDF unlock password: {password}")
        else:
            print("🔓 PDF is not encrypted or was unlocked automatically.")
        print("\n🎉 Process completed successfully!")
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()