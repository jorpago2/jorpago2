import ctypes
import hashlib
import posixpath
import stat
import subprocess
import time
import urllib.request
from ctypes import wintypes
from datetime import datetime
from pathlib import Path

try:
    import paramiko
except ImportError as error:
    raise SystemExit("Missing Paramiko. Run: python -m pip install --user paramiko==4.0.0") from error


HOST = "disco.uv.es"
USERNAME = "jorpago2"
CREDENTIAL_TARGET = HOST
REMOTE_DIRECTORY = "web"
REMOTE_URL = "https://www.uv.es/jorpago2/"
PROJECT_ROOT = Path(__file__).resolve().parent.parent
SOURCE_DIRECTORY = PROJECT_ROOT / "publish" / "jorpago2"
BACKUP_ROOT = Path.home() / "Desktop" / "web-jorge-uv-backups"


class Credential(ctypes.Structure):
    _fields_ = [
        ("Flags", wintypes.DWORD),
        ("Type", wintypes.DWORD),
        ("TargetName", wintypes.LPWSTR),
        ("Comment", wintypes.LPWSTR),
        ("LastWritten", wintypes.FILETIME),
        ("CredentialBlobSize", wintypes.DWORD),
        ("CredentialBlob", ctypes.POINTER(ctypes.c_ubyte)),
        ("Persist", wintypes.DWORD),
        ("AttributeCount", wintypes.DWORD),
        ("Attributes", wintypes.LPVOID),
        ("TargetAlias", wintypes.LPWSTR),
        ("UserName", wintypes.LPWSTR),
    ]


def build_and_test() -> None:
    subprocess.run(["node", "scripts/build.mjs"], cwd=PROJECT_ROOT, check=True)
    subprocess.run(["node", "--test", "tests/site.test.mjs"], cwd=PROJECT_ROOT, check=True)


def read_windows_credential(target: str) -> tuple[str, str]:
    credential_pointer = ctypes.POINTER(Credential)()
    cred_read = ctypes.windll.advapi32.CredReadW
    cred_read.argtypes = [
        wintypes.LPCWSTR,
        wintypes.DWORD,
        wintypes.DWORD,
        ctypes.POINTER(ctypes.POINTER(Credential)),
    ]
    cred_read.restype = wintypes.BOOL
    ctypes.windll.advapi32.CredFree.argtypes = [ctypes.c_void_p]

    if not cred_read(target, 1, 0, ctypes.byref(credential_pointer)):
        raise ctypes.WinError()

    try:
        credential = credential_pointer.contents
        password_bytes = ctypes.string_at(credential.CredentialBlob, credential.CredentialBlobSize)
        return credential.UserName, password_bytes.decode("utf-16-le")
    finally:
        ctypes.windll.advapi32.CredFree(credential_pointer)


def connect() -> tuple[paramiko.SSHClient, paramiko.SFTPClient]:
    username, password = read_windows_credential(CREDENTIAL_TARGET)
    if username != USERNAME:
        raise RuntimeError(f"Unexpected username in Windows credential: {username}")
    known_hosts = Path.home() / ".ssh" / "known_hosts"
    if not known_hosts.is_file():
        raise RuntimeError(f"Missing SSH host-key file: {known_hosts}")

    client = paramiko.SSHClient()
    client.load_host_keys(str(known_hosts))
    client.set_missing_host_key_policy(paramiko.RejectPolicy())
    client.connect(
        HOST,
        username=username,
        password=password,
        look_for_keys=False,
        allow_agent=False,
        timeout=15,
        auth_timeout=15,
    )
    return client, client.open_sftp()


def backup_remote(sftp: paramiko.SFTPClient, remote_root: str) -> Path:
    destination = BACKUP_ROOT / datetime.now().strftime("%Y-%m-%d-%H%M%S")
    destination.mkdir(parents=True, exist_ok=False)
    file_count = 0

    def download_directory(remote_path: str, local_path: Path) -> None:
        nonlocal file_count
        local_path.mkdir(exist_ok=True)
        for entry in sftp.listdir_attr(remote_path):
            remote_entry = posixpath.join(remote_path, entry.filename)
            local_entry = local_path / entry.filename
            if stat.S_ISDIR(entry.st_mode):
                download_directory(remote_entry, local_entry)
            elif stat.S_ISREG(entry.st_mode):
                sftp.get(remote_entry, str(local_entry))
                file_count += 1

    download_directory(remote_root, destination)
    print(f"Backup: {file_count} files in {destination}")
    return destination


def ensure_remote_directory(
    sftp: paramiko.SFTPClient,
    remote_root: str,
    relative_directory: str,
) -> None:
    current = remote_root
    for component in relative_directory.strip("/").split("/"):
        if not component:
            continue
        current = posixpath.join(current, component)
        try:
            attributes = sftp.stat(current)
            if not stat.S_ISDIR(attributes.st_mode):
                raise RuntimeError(f"Remote path is not a directory: {current}")
        except FileNotFoundError:
            sftp.mkdir(current)


def upload(sftp: paramiko.SFTPClient, remote_root: str, files: list[Path]) -> None:
    for index, local_path in enumerate(files, start=1):
        relative_path = local_path.relative_to(SOURCE_DIRECTORY).as_posix()
        ensure_remote_directory(sftp, remote_root, posixpath.dirname(relative_path))
        sftp.put(str(local_path), posixpath.join(remote_root, relative_path))
        print(f"Upload: {index}/{len(files)} {relative_path}")


def sha256_file(path: Path) -> bytes:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.digest()


def verify(sftp: paramiko.SFTPClient, remote_root: str, files: list[Path]) -> None:
    for local_path in files:
        relative_path = local_path.relative_to(SOURCE_DIRECTORY).as_posix()
        remote_digest = hashlib.sha256()
        with sftp.open(posixpath.join(remote_root, relative_path), "rb") as remote_file:
            for chunk in iter(lambda: remote_file.read(1024 * 1024), b""):
                remote_digest.update(chunk)
        if sha256_file(local_path) != remote_digest.digest():
            raise RuntimeError(f"Remote verification failed: {relative_path}")


def verify_http() -> None:
    for relative_path in ("index.html", "es/index.html", "va/index.html"):
        public_path = relative_path.removesuffix("index.html")
        expected_digest = sha256_file(SOURCE_DIRECTORY / relative_path)
        for attempt in range(6):
            url = f"{REMOTE_URL}{public_path}?v={time.time_ns()}"
            request = urllib.request.Request(url, headers={"User-Agent": "jorpago2-deploy/1.0"})
            with urllib.request.urlopen(request, timeout=20) as response:
                content = response.read()
                if response.status != 200:
                    raise RuntimeError(f"HTTP verification failed ({response.status}): {url}")
            if hashlib.sha256(content).digest() == expected_digest:
                break
            if attempt == 5:
                raise RuntimeError(f"Published page differs from build output: {url}")
            time.sleep(5)
    print("HTTP: English, Spanish and Valencian homepages verified")


def main() -> None:
    build_and_test()
    if not (SOURCE_DIRECTORY / "index.html").is_file():
        raise RuntimeError(f"Missing build output: {SOURCE_DIRECTORY}")

    files = sorted(path for path in SOURCE_DIRECTORY.rglob("*") if path.is_file())
    client, sftp = connect()
    try:
        remote_root = sftp.normalize(REMOTE_DIRECTORY)
        if not stat.S_ISDIR(sftp.stat(remote_root).st_mode):
            raise RuntimeError(f"Remote target is not a directory: {remote_root}")
        backup_remote(sftp, remote_root)
        upload(sftp, remote_root, files)
        verify(sftp, remote_root, files)
    finally:
        sftp.close()
        client.close()

    verify_http()
    print(f"Published and verified {len(files)} files: {REMOTE_URL}")


if __name__ == "__main__":
    main()
