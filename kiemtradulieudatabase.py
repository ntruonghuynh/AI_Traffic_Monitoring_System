import sqlite3

# Kết nối đến database
conn = sqlite3.connect("violations.db")
c = conn.cursor()

# Truy vấn dữ liệu từ bảng violations
c.execute("SELECT * FROM violations")
rows = c.fetchall()

# Kiểm tra nếu có dữ liệu
if rows:
    for row in rows:
        print(row)  # In từng dòng dữ liệu
else:
    print("Không có dữ liệu trong bảng violations.")

# Đóng kết nối
conn.close()
