
import os

def tail_log():
    log_path = r'c:\Users\john-PC\Desktop\QFE\server.log'
    try:
        with open(log_path, 'rb') as f:
            f.seek(0, os.SEEK_END)
            size = f.tell()
            f.seek(max(size - 10000, 0)) # Last 10KB
            data = f.read().decode('utf-8', errors='ignore')
            print(data)
    except Exception as e:
        print(e)

if __name__ == "__main__":
    tail_log()
