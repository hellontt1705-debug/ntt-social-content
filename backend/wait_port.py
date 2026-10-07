import sys
import socket
import time

def wait_for_port(port: int, max_seconds: int = 30) -> bool:
    t0 = time.time()
    while time.time() - t0 < max_seconds:
        for host in ('127.0.0.1', 'localhost'):
            try:
                s = socket.create_connection((host, port), timeout=0.8)
                s.close()
                return True
            except Exception:
                pass
        time.sleep(0.5)
    return False

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    timeout = int(sys.argv[2]) if len(sys.argv) > 2 else 30
    ready = wait_for_port(port, timeout)
    sys.exit(0 if ready else 1)
