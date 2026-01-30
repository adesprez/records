# My records collection

## Test locally

With Python 3.10+ and `requests` module installed:

```
export DISCOGS_USER=adrien.desprez
export DISCOGS_TOKEN=<SECRET>
python sync_discogs.py
python -m http.server 8000 --bind 0.0.0.0
```

Then, on Linux, to view the site from your phone on the same Wi‑Fi:

1. Find your laptop's IP address:

```bash
ip a
```

Find your private IP amongst those interfaces.


2. Allow port 8000 through the firewall (temporary for this session):

```bash
sudo firewall-cmd --add-port=8000/tcp
```

3. On your phone's browser, open:

```
http://<laptop-ip>:8000/
```

replacing `<laptop-ip>` with the address from step 1.
