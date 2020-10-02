import copy
import logging
# import json
import os
import pwd
import sqlite3 as db
import sys
import time
from datetime import datetime

import matplotlib.pyplot as plt
import numpy as np

# import piplates.DAQC2plate as das

logger = logging.getLogger("home_das")
logger.setLevel(logging.DEBUG)
fh = logging.FileHandler("/home/pi/home_das/python_output_log.txt")
fh.setLevel(logging.DEBUG)


def exception_handler(typ, value, tb):
    logger.exception("Uncaught Exception: {}".format(str(value)))


sys.excepthook = exception_handler

# logger.addHandler(fh)

current_user = pwd.getpwuid(os.getuid())[0]

base_dir = os.path.join(os.path.sep, "home", "pi", "home_das")

startup_message = "Startup @ {}. Current user is: {}".format(
    datetime.now().strftime("%c"), current_user
)

print(startup_message)
startup_file = open(os.path.join(base_dir, "home_das.log"), "a")
startup_file.write("{}\n".format(startup_message))
startup_file.close()


das_address = 0
data_schema = {
    "0": {
        "name": "Septic Pump",
        "voltage": 0,
    },
    "1": {"name": "Empty", "voltage": 0},
    "2": {"name": "Empty", "voltage": 0},
    "3": {"name": "Empty", "voltage": 0},
    "4": {"name": "Empty", "voltage": 0},
    "5": {"name": "Empty", "voltage": 0},
    "6": {"name": "Empty", "voltage": 0},
    "7": {"name": "Empty", "voltage": 0},
}

data_rate_hz = 120  # Is this too much?
data_collection_voltage_threshold = 0.1

data = []


def setup_db():
    connection = db.connect("home_das_data.db")

    with connection:
        cursor = connection.cursor()
        cursor.execute(
            "CREATE TABLE SEPTIC_DATA(timestamp DATETIME, raw_sensor_voltage NUMERIC, amperage NUMERIC)"
        )

    return connection


def acquire_data():
    # all_data = das.getADCall(das_address)
    all_data = das.getADC(das_address, 0)
    # this_data = copy.deepcopy(data_schema)

    # for index, value in enumerate(all_data):
    #     this_data[index]["voltage"] = value

    # data.push([datetime.now(), all_data])
    return all_data


def log_data():
    return True


one_sample_time = 1000000000 // data_rate_hz
pump_gallons_per_minute = 43.5  # Per Anettes Engineering Docs
pump_gallons_per_second = pump_gallons_per_minute / 60
transport_volume = 12.8  # Gallons that drain from the pipe after pumping is complete
pump_gallons_per_dose = 107.2


def has_time_passed(input_loop_time):
    if (time.time_ns() - input_loop_time) > one_sample_time:
        return True
    return False


def get_raw_to_voltage_to_amps_conversion_factor():
    vin_min = 0.0
    vin_max = 10.0
    amps_min = 0.0
    amps_max = 20.0

    return (amps_max - amps_min) / (vin_max - vin_min)


def convert_raw_voltage_to_amps(raw_voltage):
    return raw_voltage * get_raw_to_voltage_to_amps_conversion_factor()


loop_time = 0
conversion_factor = get_raw_to_voltage_to_amps_conversion_factor()
samples = []
sample_times = []
data_collection_start = 0
print("Monitoring data at {} sample(s) per second".format(data_rate_hz))
print("Amperage conversion factor is: {}".format(conversion_factor))
connection = db.connect(
    os.path.join(base_dir, "home_das_db.db"),
    detect_types=db.PARSE_DECLTYPES | db.PARSE_COLNAMES,
)

max_data_rate_hz_start = time.time_ns()
max_data_rate_samples = 0
for i in range(10):
    acquire_data()
    max_data_rate_samples = max_data_rate_samples + 1

max_data_rate_hz_end = time.time_ns()
average_ns_per_daq = (
    max_data_rate_hz_end - max_data_rate_hz_start
) / max_data_rate_samples

print("Maximum Data rate is: {:.2f} hz".format(1_000_000_000 / average_ns_per_daq))

now = datetime.now()
# samples = 0
with connection:
    cursor = connection.cursor()
    cursor.execute(
        "CREATE TABLE IF NOT EXISTS SEPTIC_data(timestamp DATETIME, raw_sensor_voltage NUMERIC, amperage NUMERIC)"
    )
    cursor.execute(
        "CREATE TABLE IF NOT EXISTS WATER_USAGE_DATA(timestamp DATETIME, gallons_pumped NUMERIC)"
    )

    startup_file = open(os.path.join(base_dir, "home_das.log"), "a")
    startup_file.write("{}\n".format("Starting Data Monitoring..."))
    startup_file.close()

    while True:
        if has_time_passed(loop_time):
            # print(
            #     "Current Data Rate: {} hz".format(
            #         1_000_000_000 / (time.time_ns() - loop_time)
            #     )
            # )
            # print(time.time_ns() - loop_time)
            # start = time.time_ns()
            daq_time = time.time_ns()
            data = acquire_data()

            if data > data_collection_voltage_threshold:
                if data_collection_start == 0:
                    now = datetime.now()
                    data_collection_start = daq_time
                samples.append(data)
                sample_times.append(daq_time)
            else:
                if len(samples) > 0:
                    compute_start = time.time_ns()
                    # Parse the data, save it, clear it
                    # Parse
                    # seconds = len(samples) / 30
                    seconds = (time.time_ns() - data_collection_start) / 1000000000
                    raw_samples = copy.copy(samples)
                    samples = np.array(samples)
                    # Convert everything to amperage
                    samples = samples * conversion_factor
                    max_amps = np.max(samples)
                    average_amps = np.average(samples)
                    start_time = now.strftime("%Y%m%d-%H:%M:%S")
                    pumped_gallons = (
                        seconds * pump_gallons_per_second
                    ) - transport_volume

                    # Save
                    log_text = "{}: Dosing pump ran for {:.2f} seconds, pumped {:.2f} gallons with a max amperage of {:.2f}A, an average amperage of {:.2f}A, and an average wattage of {:.2f}W".format(
                        start_time,
                        seconds,
                        pumped_gallons,
                        max_amps,
                        average_amps,
                        average_amps * 120.0,
                    )
                    print(log_text)

                    # log_file = open("home_das.log", "a")
                    log_file = open(os.path.join(base_dir, "home_das.log"), "a")
                    log_file.write("{}\n".format(log_text))

                    np.savetxt(
                        os.path.join(base_dir, "{}.csv".format(start_time)),
                        samples,
                        delimiter=",",
                    )
                    np.savetxt(
                        os.path.join(base_dir, "RAW_{}.csv".format(start_time)),
                        raw_samples,
                        delimiter=",",
                    )
                    np.savetxt(
                        os.path.join(base_dir, "NS_{}.csv".format(start_time)),
                        sample_times,
                        delimiter=",",
                    )

                    plt.plot(samples)
                    plt.ylabel("Amps")
                    plt.title("Septic Pump Run - {}".format(start_time))
                    plt.savefig(
                        os.path.join(base_dir, "Amperage-{}.png".format(start_time))
                    )
                    plt.close()

                    # Water Usage
                    cursor.execute(
                        "INSERT INTO WATER_USAGE_DATA(timestamp, gallons_pumped) VALUES(?, ?)",
                        (now, pumped_gallons),
                    )

                    cursor.execute(
                        "SELECT * FROM WATER_USAGE_DATA",
                    )
                    # What order are these in?
                    water_data = cursor.fetchall()
                    print("Water data: ", water_data)
                    water_data_timestamps = [i[0] for i in water_data]
                    water_data_gallons_pumped = [i[1] for i in water_data]
                    water_data_gallons_pumped = np.cumsum(water_data_gallons_pumped)
                    print("Pump Timestamps: ", water_data_timestamps)
                    print("Gallons pumped: ", water_data_gallons_pumped)

                    plt.plot(water_data_timestamps, water_data_gallons_pumped)
                    plt.ylabel("Gallons")
                    plt.title(
                        "Water Usage: {} - {}".format(
                            water_data_timestamps[0], water_data_timestamps[-1]
                        )
                    )
                    plt.savefig(
                        os.path.join(base_dir, "WaterUsage-{}.png".format(start_time))
                    )
                    plt.close()

                    # Data Analysis
                    time_btw_samples = np.diff(np.array(sample_times))
                    data_analysis_text = "The average time between samples is: {}ns, std dev is: {}ns, it should be {}ns".format(
                        np.average(time_btw_samples),
                        np.std(time_btw_samples),
                        one_sample_time,
                    )
                    log_file.write("{}\n".format(data_analysis_text))

                    plt.plot(sample_times)
                    plt.ylabel("Sample Time (ns)")
                    plt.title("Sample Times - {}".format(start_time))
                    plt.savefig(
                        os.path.join(base_dir, "SampleTimes-{}.png".format(start_time))
                    )
                    plt.close()

                    compute_end = time.time_ns()
                    compute_log = (
                        "Parsing, Logging, Saving, and Graphing took {} ms".format(
                            (compute_end - compute_start) / 1000000
                        )
                    )
                    print(compute_log)
                    log_file.write("{}\n".format(compute_log))
                    log_file.close()

                    # Clear
                    samples = []
                    sample_times = []
                    data_collection_start = 0
                    # samples = np.array(samples)
                    # samples_min = np.min(samples)
                    # samples_max = np.max(samples)
                    # sample_times = np.array(sample_times)
            loop_time = time.time_ns()

            # print(data)
            # cursor.execute("INSERT INTO SEPTIC_data values(datetime('now'), (?), (?))", (data, data * 2))
            # samples += 1
            # if samples % 1000 == 0:
            #     print("Acquired {} samples!".format(samples))
            # print("Data Acquired in {} ms".format((time.time_ns() - start) / 1000000))
            # print(time.time_ns() - loop_time)
            # print(one_sample_time)
