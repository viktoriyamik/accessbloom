# AccessBloom security model

**The public demo is synthetic and needs no credentials. Real scanning and stored audit reports require a server-side owner token.** No token or API key belongs in the repository or browser source code.

Arbitrary browser-based URL scanning is a dangerous class of service. The application uses hostname allowlisting, DNS checks, subresource request filtering, blocked non-HTTP schemes, owner-only access, rate limits, and resource caps. **These controls do not completely prevent DNS rebinding or browser-level SSRF.** For production, isolate the scanner process/container and enforce egress firewall rules that block private/loopback/link-local/metadata networks, with a destination-policy capable proxy or controlled allowlist. Do not expose unrestricted scanning to anonymous visitors.

Only audit websites you own or have permission to test. A screenshot may include personal information, and optionally using the OpenAI API transmits a reduced screenshot and extracts of page HTML/issue evidence to the configured provider. Do not scan pages containing confidential information without appropriate approval. Store audit data in protected storage; define retention before team use. An owner token is a single-operator control, not multi-user account management.

Report security issues privately to the maintainer; do not post exploit payloads in public issues. Rotate compromised owner tokens immediately and restart the systemd service.
