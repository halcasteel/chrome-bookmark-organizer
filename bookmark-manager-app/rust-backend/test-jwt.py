#!/usr/bin/env python3
import jwt
import json
import sys

if len(sys.argv) < 2:
    print("Usage: python test-jwt.py <token>")
    sys.exit(1)

token = sys.argv[1]
secret = "local-dev-jwt-secret-change-in-production"

try:
    # Decode without verification first to see the payload
    decoded_unverified = jwt.decode(token, options={"verify_signature": False})
    print("Token payload (unverified):")
    print(json.dumps(decoded_unverified, indent=2))
    
    # Now try to verify with the secret
    decoded_verified = jwt.decode(token, secret, algorithms=["HS256"])
    print("\nToken is valid with secret!")
    print(json.dumps(decoded_verified, indent=2))
except jwt.ExpiredSignatureError:
    print("\nToken has expired")
except jwt.InvalidTokenError as e:
    print(f"\nToken is invalid: {e}")