# Deploy ThePlanner for free on Oracle Cloud

This puts ThePlanner on a free Oracle Cloud server with HTTPS, so you can use it from your phone and laptop and get reminders. It takes about 20 minutes. Oracle's Always Free tier doesn't expire, and the server stays on, so reminders keep arriving.

You need a free Oracle Cloud account, and a computer with a terminal (Windows Terminal, PowerShell, macOS or Linux).

## 1. Create the Oracle Cloud account

Sign up at **oracle.com/cloud/free**. Oracle asks for a card to verify your identity; Always Free resources are not charged.

Choose your **home region** carefully, because it can't be changed later, and pick one close to you (for Morocco: Madrid, Marseille or Paris). If Arm servers are often "out of capacity" in a region, the setup also works on the small AMD server (step 2).

## 2. Create the server

In the Oracle Cloud console, open **Compute → Instances → Create instance**.

1. **Name:** `theplanner`.
2. **Image and shape → Edit:**
   - Image: **Canonical Ubuntu 24.04**.
   - Shape: **Ampere → VM.Standard.A1.Flex** with **1 OCPU and 6 GB memory** (Always Free eligible).
   - If Oracle says it's out of capacity, choose **Specialty and previous generation → VM.Standard.E2.1.Micro** instead.
3. **Networking:** keep the defaults, so it creates a new network with a **public IPv4 address**.
4. **Add SSH keys:** choose **Generate a key pair for me** and **Save private key**. Keep that file safe; it's how you log in.
5. Click **Create** and wait until the state is **Running**. Copy the **Public IP address**.

## 3. Open ports 80 and 443

The server needs to accept web traffic.

1. On the instance page, open the **Subnet** link, then the **Default Security List**.
2. Click **Add Ingress Rules** and add one rule:
   - Source CIDR: `0.0.0.0/0`
   - IP protocol: **TCP**
   - Destination port range: `80,443`
3. Save.

(The server's own firewall is opened by the setup script.)

## 4. Connect to the server

On your computer, in the folder where you saved the key (replace the file name and IP):

```bash
# macOS / Linux: restrict the key first
chmod 600 ssh-key.key

ssh -i ssh-key.key ubuntu@YOUR_PUBLIC_IP
```

On Windows, the same `ssh` command works in PowerShell. If it complains that the key's permissions are too open, right-click the key file → Properties → Security → Advanced, disable inheritance, and leave only your own user.

## 5. Install ThePlanner

On the server:

```bash
git clone https://github.com/abdellahBSK/ThePlanner.git
cd ThePlanner
sudo ./deploy/setup.sh
```

The repository is private, so `git clone` asks for a username and password. Enter your GitHub username, and as the password a **personal access token**: on GitHub go to **Settings → Developer settings → Fine-grained tokens → Generate new token**, limit it to the **ThePlanner** repository with **Contents: Read-only**, and paste the token. (If you make the repository public, no token is needed.)

The script asks two questions:

- **Web address.** Press Enter to use the free address it suggests, like `141-147-10-20.sslip.io`, which points to your server's IP. If you have your own domain or a free [DuckDNS](https://www.duckdns.org) name pointing to the IP, type that instead.
- **Email.** It's used for the free HTTPS certificate (Let's Encrypt) and for notification settings.

It then installs Docker, opens the firewall, builds and starts the app behind Caddy (which gets the HTTPS certificate), and schedules a daily backup. When it prints **ThePlanner is live at https://…**, open that address, create your account, and turn on notifications in **Settings → Reminders** on each device.

On iPhone, open the site in Safari, tap **Share → Add to Home Screen**, and open it from the Home Screen before turning on notifications. iOS only allows notifications for installed web apps.

## Everyday tasks

Run these on the server, from the `ThePlanner` folder:

| What | Command |
| --- | --- |
| Update to the latest code (keeps your data) | `sudo ./deploy/update.sh` |
| Back up now (also runs daily at 03:15) | `sudo ./deploy/backup.sh` |
| See the app's logs | `cd deploy && sudo docker compose logs -f app` |
| Restart | `cd deploy && sudo docker compose restart` |

Backups are kept for 14 days inside the app's data volume. To copy one to your computer:

```bash
# on the server
cd ~/ThePlanner/deploy
sudo docker compose cp app:/data/backups ./backups
# on your computer
scp -i ssh-key.key -r ubuntu@YOUR_PUBLIC_IP:ThePlanner/deploy/backups .
```

## If something doesn't work

- **The page doesn't open, or the setup waits for HTTPS and gives up.** Check step 3 (the ingress rule for ports 80 and 443), then run `cd deploy && sudo docker compose logs caddy`. Caddy needs port 80 to be reachable to get the certificate.
- **"Out of capacity" when creating the Arm server.** Try again later, try another availability domain, or use the AMD micro shape. The setup adds swap memory so the build fits in 1 GB.
- **Notifications don't arrive.** They need HTTPS, notifications allowed for the site in your browser, and on iPhone the app added to the Home Screen. Use **Send a test** in Settings to check.
- **Calendar app doesn't show changes.** Calendar apps refresh subscribed calendars every few hours.
