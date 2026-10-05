import cv2
import csv
import os
import sqlite3
from datetime import datetime
from ultralytics import YOLO
from license_plate_recognition import detect_license_plate, read_license_plate
import numpy as np

# Khởi tạo model nhận diện phương tiện
VEHICLE_MODEL_PATH = "yolov8m.pt"
vehicle_model = YOLO(VEHICLE_MODEL_PATH)

# Nhãn phương tiện từ COCO dataset
coco_labels = {2: "Car", 3: "Motorcycle", 5: "Bus", 7: "Truck"}

# Kết nối hoặc tạo database
conn = sqlite3.connect("violations.db")
c = conn.cursor()
c.execute('''CREATE TABLE IF NOT EXISTS violations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                vehicle_type TEXT,
                timestamp TEXT)''')
conn.commit()

def save_violation_to_db(vehicle_type):
    """Lưu thông tin phương tiện vi phạm vào database"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    c.execute("INSERT INTO violations (vehicle_type, timestamp) VALUES (?, ?)", (vehicle_type, timestamp))
    conn.commit()

# Thư mục lưu ảnh biển số để kiểm tra
os.makedirs("plates_detected", exist_ok=True)

def enhance_image(image):
    """Nâng cao chất lượng ảnh biển số"""
    return cv2.detailEnhance(image, sigma_s=10, sigma_r=0.15)

def detect_traffic_violation(video_path):
    """Nhận diện phương tiện vi phạm và đọc biển số"""
    cap = cv2.VideoCapture(video_path)
    width, height = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    line_y = int(height * 0.48)  # Vị trí vạch đèn đỏ
    violators = set()
    results_csv = []

    frame_id = 0  # Biến đếm frame để debug
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        results = vehicle_model(frame, conf=0.3)
        for result in results:
            for box in result.boxes:
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                cls = int(box.cls[0])
                track_id = box.id[0] if box.id is not None else None

                if cls in coco_labels:
                    vehicle_type = coco_labels[cls]
                    y_center = (y1 + y2) // 2

                    # Kiểm tra phương tiện có vượt đèn đỏ không
                    if y1 < line_y and y_center > line_y:
                        if track_id and track_id in violators:
                            continue

                        print(f"[DEBUG] Phát hiện {vehicle_type} vượt đèn đỏ tại frame {frame_id}")

                        plate_crop, plate_box = detect_license_plate(frame, (x1, y1, x2, y2))
                        plate_text, plate_score = None, None

                        if plate_crop is not None:
                            enhanced_plate = enhance_image(plate_crop)
                            plate_text, plate_score = read_license_plate(enhanced_plate, frame_id)

                            # Lưu ảnh biển số vào thư mục plates_detected
                            plate_filename = f"plates_detected/cropped_plate_{frame_id}.png"
                            cv2.imwrite(plate_filename, enhanced_plate)
                            print(f"[DEBUG] Đã lưu ảnh biển số: {plate_filename}")

                            # Hiển thị ảnh biển số từ plates_detected lên khung phương tiện
                            detected_plate = cv2.imread(plate_filename)
                            if detected_plate is not None:
                                plate_resized = cv2.resize(detected_plate, (min(100, width - x1), 50))
                                frame[y1:y1+50, x1:x1+plate_resized.shape[1]] = plate_resized

                        if plate_text:
                            cv2.putText(frame, plate_text, (x1 + 10, y1 + 30),
                                        cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 0, 0), 2)

                        cv2.putText(frame, "Vuot den do!", (x1, y1 - 30),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
                        cv2.putText(frame, f"Loai: {vehicle_type}", (x1, y1 - 10),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
                        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 3)

                        print(f"[DEBUG] Phuong tien {vehicle_type} - Bien so: {plate_text if plate_text else 'None'}")

                        if track_id:
                            violators.add(track_id)
                        else:
                            violators.add((x1, y1, x2, y2))

                        if plate_box:
                            px1, py1, px2, py2 = plate_box
                            cv2.rectangle(frame, (px1, py1), (px2, py2), (255, 0, 0), 2)
                            if plate_score is not None:
                                cv2.putText(frame, f"OCR: {plate_score:.2f}", (px1, py1 - 5),
                                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 0), 2)

                        # **Lưu dữ liệu vi phạm vào database**
                        save_violation_to_db(vehicle_type)

                        results_csv.append([vehicle_type, plate_text if plate_text else 'None'])

        cv2.line(frame, (0, line_y), (width, line_y), (0, 0, 255), 3)
        cv2.imshow("Video", frame)

        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

        frame_id += 1

    cap.release()
    cv2.destroyAllWindows()

    # Xuất kết quả ra CSV
    with open("violators.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["Loai Phuong Tien", "Bien So"])
        writer.writerows(results_csv)
    print("Đã lưu kết quả vào violators.csv")

if __name__ == "__main__":
    video = "7.mp4"  # Đường dẫn video của bạn
    if not os.path.exists(video):
        print(f"[ERROR] Không tìm thấy video: {video}")
    else:
        detect_traffic_violation(video)
