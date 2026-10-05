import cv2
import numpy as np
import easyocr
import re
import os
from ultralytics import YOLO
from datetime import datetime

# Định nghĩa model nhận diện biển số
license_plate_detector = YOLO('./models/license_plate_detector.pt')

# Khởi tạo EasyOCR với tiếng Anh và tiếng Việt
reader = easyocr.Reader(['en', 'vi'], gpu=True)

# Nhãn biển số hợp lệ
license_plate_pattern = r"\d{2}[A-Z]-\d{4,5}|\d{2}[A-Z]-\d{3}\.\d{2}"

# Tạo thư mục lưu biển số
os.makedirs("plates", exist_ok=True)

def sharpen_image(image):
    """Làm sắc nét hình ảnh"""
    kernel = np.array([[-1, -1, -1],
                       [-1,  9, -1],
                       [-1, -1, -1]])
    return cv2.filter2D(image, -1, kernel)

def preprocess_license_plate(image):
    """Cải thiện chất lượng ảnh biển số trước khi OCR"""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blur = cv2.bilateralFilter(gray, 11, 17, 17)  # Thay Gaussian bằng bilateral
    contrast = cv2.equalizeHist(blur)
    binary = cv2.adaptiveThreshold(contrast, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                   cv2.THRESH_BINARY_INV, 11, 2)
    kernel = np.ones((3, 3), np.uint8)
    processed = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)
    return sharpen_image(processed)

def format_license(text):
    """Chuẩn hóa biển số xe"""
    text = text.upper().replace(' ', '')
    replacements = {'O': '0', 'I': '1', 'J': '3', 'A': '4', 'G': '6', 'S': '5'}
    corrected_text = ''.join(replacements.get(c, c) for c in text)
    return corrected_text if re.match(license_plate_pattern, corrected_text) else None

def read_license_plate(license_plate_crop, plate_id):
    """Nhận diện biển số từ ảnh cắt"""
    processed_plate = preprocess_license_plate(license_plate_crop)

    # Lưu ảnh để kiểm tra
    plate_path = f"plates/plate_{plate_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
    cv2.imwrite(plate_path, processed_plate)

    detections = reader.readtext(processed_plate, detail=0, paragraph=True)
    for text in detections:
        print(f"OCR phát hiện: {text}")
        formatted_text = format_license(text)
        if formatted_text:
            return formatted_text, 1.0  # EasyOCR không hỗ trợ score khi detail=0
    return None, None

def detect_license_plate(frame, vehicle_box):
    """Tìm vùng biển số trong xe"""
    x1, y1, x2, y2 = vehicle_box
    vehicle_crop = frame[y1:y2, x1:x2]
    plate_results = license_plate_detector(vehicle_crop, conf=0.3, iou=0.5)

    for plate in plate_results:
        for box in plate.boxes:
            px1, py1, px2, py2 = map(int, box.xyxy[0])
            plate_crop = vehicle_crop[py1:py2, px1:px2]
            return plate_crop, (x1 + px1, y1 + py1, x1 + px2, y1 + py2)
    return None, None
