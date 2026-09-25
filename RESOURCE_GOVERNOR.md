# Resource Governor

The governor makes routing and fan-out decisions from explicit policy and
human-recorded usage state. It never scrapes an account, invents a meter,
changes billing, or treats unknown usage as unlimited.

Modes should be legible:

- `PRESERVE`: protect scarce resources and avoid optional fan-out.
- `NORMAL`: use the smallest capable team for ordinary work.
- `HARVEST`: only when explicitly approved and all safety gates pass.

The governor does not authorize spending. It constrains a request before an
approval or execution boundary. See [EFFICIENCY.md](EFFICIENCY.md) and
[examples/usage-aware-routing.md](examples/usage-aware-routing.md).
