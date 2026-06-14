# Fuel Station Management System

A premium, local-first Single Page Application (SPA) designed to streamline fuel station operations, track daily shifts, manage underground storage tanks (USTs), handle tanker deliveries, and optimize payments based on banking calendars.

## Core Features
1. **Double Dispensing Unit (DU) Tracking**: Manage 4 totalizers (2 DUs, each with a Petrol and Diesel nozzle).
2. **Shift Management**: Day (8:00 AM - 8:00 PM) and Night (8:00 PM - 8:00 AM) shift tracking with automatic start-reading carry-over.
3. **Nozzle Calibration Deductions**: Account for 5-liter quality tests that increment totalizers but recirculate back into underground tanks, excluding them from sales volume.
4. **Active Price History**: Dynamic selling price tracking for accurate billing.
5. **Stock Management**: Track underground storage tank (UST) levels using Weighted Average Cost (WAC).
6. **Predictive Ordering Engine**: Forecasts when the next 12kl tanker load (full or mixed) is required and recommends the best load composition.
7. **Credit & Bank Holiday Planner**: Calculates interest-free payment deadlines (2 days from purchase) and recommends the latest possible bank working day to file RTGS transfers, avoiding weekends and public holidays.
8. **Data Portability**: Full JSON Backup/Restore and CSV export for Excel compatibility.

## Mathematical Formulas

### 1. Shift Sales Calculation
For each nozzle:
$$\text{Gross Volume (Liters)} = \text{Ending Totalizer} - \text{Starting Totalizer}$$
$$\text{Test Volume (Liters)} = \text{Number of Tests} \times 5$$
$$\text{Net Sales Volume (Liters)} = \text{Gross Volume} - \text{Test Volume}$$
$$\text{Nozzle Revenue} = \text{Net Sales Volume} \times \text{Selling Price}$$

### 2. Stock Levels
$$\text{New Stock} = \text{Previous Stock} + \text{Purchased Volume} - \text{Net Sales Volume}$$
*(Note: Test fuel returns to the tank immediately, so it does not reduce stock.)*

### 3. Predictive Ordering (Runout & Load Recommendation)
- **Average Daily Sales (ADS)**: Rolling average of daily sales for each fuel type.
- **Days until Empty**:
  $$\text{Days to Order} = \frac{\text{Current Stock} - \text{Safety Stock}}{\text{ADS}}$$
- **12kl Tanker Optimization**: Recommends combinations (12kl Petrol, 12kl Diesel, 8D/4P, 8P/4D, or 6D/6P) based on available tank capacity and which fuel hits the safety threshold first.

### 4. Credit Deadline & RTGS Calendar
- **Interest-Free Deadline**: $\text{Purchase Date} + 2\text{ days}$.
- **RTGS Filing Date**: The latest bank working day on or before the deadline. If the deadline falls on a holiday or weekend, it back-steps to the previous open day.

## How to Run
This is a self-contained web application.
1. Open the [index.html](file:///Users/macintosh/.gemini/antigravity/scratch/fuel-station-manager/index.html) file directly in any modern web browser.
2. Data is saved automatically in your browser's local storage (`localStorage`).
3. Use the **Settings** panel to perform backups, restore database, or export to CSV.
