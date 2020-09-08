import copy
from datetime import datetime
import time
import os
import pwd
print("Current user is: {}".format(pwd.getpwuid(os.getuid())[0]))

import sqlite3 as db
import numpy as np
import matplotlib.pyplot as plt

import piplates.DAQC2plate as das

das_address = 0
data_schema = {
    "0": {
        "name": "Septic Pump",
        "voltage": 0,
    },
    "1": {
        "name": "Empty",
        "voltage": 0
    },
    "2": {
        "name": "Empty",
        "voltage": 0
    },
    "3": {
        "name": "Empty",
        "voltage": 0
    },
    "4": {
        "name": "Empty",
        "voltage": 0
    },
    "5": {
        "name": "Empty",
        "voltage": 0
    },
    "6": {
        "name": "Empty",
        "voltage": 0
    },
    "7": {
        "name": "Empty",
        "voltage": 0
    },
}

data_rate_hz = 30  # Is this too much?
data_collection_voltage_threshold = 0.1

data = []


def setup_db():
    connection = db.connect("home_das_data.db")

    with connection:
        cursor = connection.cursor()
        cursor.execute("CREATE TABLE SEPTIC_DATA(timestamp DATETIME, raw_sensor_voltage NUMERIC, amperage NUMERIC)")

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


loop_time = 0
one_sample_time = 1000000000 // data_rate_hz


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


conversion_factor = get_raw_to_voltage_to_amps_conversion_factor()
samples = []
sample_times = []
data_collection_start = 0
print("Monitoring data at {} sample(s) per second".format(data_rate_hz))
print("Amperage conversion factor is: {}".format(conversion_factor))
connection = db.connect("home_das_db.db")
now = datetime.now()
# samples = 0

with connection:
    cursor = connection.cursor()
    cursor.execute("CREATE TABLE IF NOT EXISTS SEPTIC_data(timestamp DATETIME, raw_sensor_voltage NUMERIC, amperage NUMERIC)")

    while(True):
        if(has_time_passed(loop_time)):
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
                    start_time = now.strftime("%Y%d%m-%H:%M:%S")

                    # Save
                    log_text = "{}: Septic pump ran for {} seconds with a max amperage of {}A, an average amperage of {}A, and an average wattage of ".format(start_time, seconds, max_amps, average_amps, average_amps * 120.0)
                    print(log_text)

                    log_file = open("home_das.log", "a")
                    log_file.write("{}\n".format(log_text))

                    np.savetxt("{}.csv".format(start_time), samples, delimiter=",")
                    np.savetxt("RAW_{}.csv".format(start_time), raw_samples, delimiter=",")

                    plt.plot(samples)
                    plt.ylabel("Amps")
                    plt.title("Septic Pump Run - {}".format(start_time))
                    plt.savefig("{}.png".format(start_time))
                    compute_end = time.time_ns()

                    compute_log = "Parsing, Logging, Saving, and Graphing took {} ms".format((compute_end - compute_start) / 1000000)
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

            # print(data)
            # cursor.execute("INSERT INTO SEPTIC_data values(datetime('now'), (?), (?))", (data, data * 2))
            # samples += 1
            # if samples % 1000 == 0:
            #     print("Acquired {} samples!".format(samples))
            # print("Data Acquired in {} ms".format((time.time_ns() - start) / 1000000))
            # print(time.time_ns() - loop_time)
            # print(one_sample_time)
            # loop_time = time.time_ns()
