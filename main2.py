import copy
import os
import pwd
import sqlite3 as db
import time
from datetime import datetime

import matplotlib.pyplot as plt
import numpy as np
import piplates.DAQC2plate as das


class DAQ:
    def __init__(self, data_rate_hz):
        self.base_dir = os.path.join(os.path.sep, "home", "pi", "home_das")
        self.log_file = "home_das.log"
        self.db_file = "home_das_db.db"
        self.current_user = pwd.getpwuid(os.getuid())[0]
        self.septic_data_table = "SEPTIC_data"
        self.water_usage_table = "WATER_USAGE_TABLE"

        self.data_collection_voltage_threshold = 0.1
        self.das_address = 0
        self.data_rate_hz = data_rate_hz

        self.loop_time = 0

        self.one_sample_time = 1_000_000_000 // data_rate_hz
        self.tank_elevation = 7458  # Best Guess
        self.field_elevation = 7558  # Best Guess
        self.tank_depth = 6  # feet
        self.pump_distance = 100  # feet
        self.horizontal_and_vertical_discharge = (
            self.field_elevation
            - self.tank_elevation
            + self.tank_depth
            + self.pump_distance
        )
        self.head_loss = 10.4  # ft
        self.total_dynamic_head = (
            self.field_elevation - self.tank_elevation + self.head_loss
        )

        self.pump_gallons_per_minute = (
            43.5  # Per Anettes Engineering Docs, gallons per dose should be 107.2
        )
        self.pump_gallons_per_second = self.pump_gallons_per_minute / 60
        self.transport_volume = (
            12.8  # Gallons that drain from the pipe after pumping is complete
        )

        self.conversion_factor = self.get_raw_to_voltage_to_amps_conversion_factor()
        self.samples = []
        self.sample_times = []
        self.data_collection_start = 0

        self.startup()
        self.db_connection = self.init_db()
        self.init_septic_data_table()
        self.init_water_usage_table()

    def init_db(self):
        connection = db.connect(
            os.path.join(self.base_dir, "home_das_db.db"),
            detect_types=db.PARSE_DECLTYPES | db.PARSE_COLNAMES,
        )
        return connection

    def exec_and_commit_sql(self, sql):
        cursor = self.db_connection.cursor()
        cursor.execute(sql)
        self.db_connection.commit()

    def init_septic_data_table(self):
        self.exec_and_commit_sql(
            "CREATE TABLE IF NOT EXISTS SEPTIC_data(timestamp DATETIME, raw_sensor_voltage NUMERIC, amperage NUMERIC)"
        )

    def init_water_usage_table(self):
        self.exec_and_commit_sql(
            "CREATE TABLE IF NOT EXISTS WATER_USAGE_DATA(timestamp DATETIME, gallons_pumped NUMERIC)"
        )

    def startup(self):
        self.log(
            "Startup @ {}. Current user is: {}".format(
                datetime.now().strftime("%c"), self.current_user
            )
        )

    def shutdown(self):
        self.db_connection.close()
        self.log("Graceful Shutdown @ {}".format(datetime.now().strftime("%c")))

    def log(self, message):
        log_file = open(os.path.join(self.base_dir, self.log_file), "a")
        print(message)
        log_file.write("{}\n".format(message))
        log_file.close()

    def save_csv(self, array, fname):
        np.savetxt(
            os.path.join(self.base_dir, "{}.csv".format(fname)),
            array,
            delimiter=",",
        )

    def get_raw_to_voltage_to_amps_conversion_factor(self):
        vin_min = 0.0
        vin_max = 10.0
        amps_min = 0.0
        amps_max = 50.0

        return (amps_max - amps_min) / (vin_max - vin_min)

    def convert_raw_voltage_to_amps(self, raw_voltage):
        return raw_voltage * self.get_raw_to_voltage_to_amps_conversion_factor()

    def parse_save_and_graph_data(self):
        compute_start = time.time_ns()
        # Parse the data, save it, clear it
        # Parse
        seconds = (time.time_ns() - self.data_collection_start) / 1000000000
        raw_samples = copy.copy(self.samples)
        samples = np.array(self.samples)
        # Convert everything to amperage
        samples = samples * self.conversion_factor
        max_amps = np.max(samples)
        average_amps = np.average(samples)
        start_time = self.now.strftime("%Y%m%d-%H:%M:%S")
        pumped_gallons = (
            seconds * self.pump_gallons_per_second
        ) - self.transport_volume

        # Save
        self.log(
            "{}: Dosing pump ran for {:.2f} seconds, pumped {:.2f} gallons with a max amperage of {:.2f}A, an average amperage of {:.2f}A, and an average wattage of {:.2f}W".format(
                start_time,
                seconds,
                pumped_gallons,
                max_amps,
                average_amps,
                average_amps * 120.0,
            )
        )

        self.save_csv(samples, start_time)
        self.save_csv(raw_samples, "RAW_{}".format(start_time))
        self.save_csv(self.sample_times, "NS_{}".format(start_time))

        plt.plot(samples)
        plt.ylabel("Amps")
        plt.title("Septic Pump Run - {}".format(start_time))
        plt.savefig(os.path.join(self.base_dir, "Amperage-{}.png".format(start_time)))
        plt.close()

        # Water Usage
        cursor = self.db_connection.cursor()
        cursor.execute(
            "INSERT INTO WATER_USAGE_DATA(timestamp, gallons_pumped) VALUES(?, ?)",
            (self.now, pumped_gallons),
        )

        cursor.execute(
            "SELECT * FROM WATER_USAGE_DATA",
        )
        # What order are these in?
        water_data = cursor.fetchall()
        self.db_connection.commit()
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
            os.path.join(
                self.base_dir,
                "WaterUsage-{}.png".format(start_time),
            )
        )
        plt.close()

        # Data Analysis
        time_btw_samples = np.diff(np.array(self.sample_times))
        data_analysis_text = "The average time between samples is: {}ns, std dev is: {}ns, it should be {}ns".format(
            np.average(time_btw_samples),
            np.std(time_btw_samples),
            self.one_sample_time,
        )
        self.log(data_analysis_text)

        plt.plot(self.sample_times)
        plt.ylabel("Sample Time (ns)")
        plt.title("Sample Times - {}".format(start_time))
        plt.savefig(
            os.path.join(
                self.base_dir,
                "SampleTimes-{}.png".format(start_time),
            )
        )
        plt.close()

        compute_end = time.time_ns()
        compute_log = "Parsing, Logging, Saving, and Graphing took {} ms".format(
            (compute_end - compute_start) / 1000000
        )
        self.log(compute_log)
        return

    def log_max_data_sampling_rate(self, channel):
        max_data_rate_hz_start = time.time_ns()
        max_data_rate_samples = 0
        for i in range(10):
            self.acquire_one_sample(channel)
            max_data_rate_samples = max_data_rate_samples + 1

        max_data_rate_hz_end = time.time_ns()
        average_ns_per_daq = (
            max_data_rate_hz_end - max_data_rate_hz_start
        ) / max_data_rate_samples

        self.log(
            "Maximum Data rate is: {:.2f} hz".format(1_000_000_000 / average_ns_per_daq)
        )

    def acquire_one_sample(self, channel):
        # return das.fastGetADC(self.das_address, channel)
        return das.getADC(self.das_address, channel)

    def should_sample_data(self, input_loop_time, one_sample_time):
        if (time.time_ns() - input_loop_time) > one_sample_time:
            return True
        return False

    def start_daq_loop(self, channel):
        self.log("Monitoring data at {} sample(s) per second".format(self.data_rate_hz))
        self.log("Amperage conversion factor is: {}".format(self.conversion_factor))

        self.now = datetime.now()
        self.log("Starting Data Monitoring...")

        while True:
            if self.should_sample_data(self.loop_time, self.one_sample_time):
                daq_time = time.time_ns()
                data = self.acquire_one_sample(channel)

                if data > self.data_collection_voltage_threshold:
                    if self.data_collection_start == 0:
                        self.now = datetime.now()
                        self.data_collection_start = daq_time
                    self.samples.append(data)
                    self.sample_times.append(daq_time)
                else:
                    if len(self.samples) > 0:
                        self.parse_save_and_graph_data()

                        # Clear
                        self.samples = []
                        self.sample_times = []
                        self.data_collection_start = 0

                self.loop_time = time.time_ns()


DATA_RATE_HZ = 120
PI_PLATE_ADDRESS = 0
daq = DAQ(DATA_RATE_HZ)

try:
    daq.log_max_data_sampling_rate(PI_PLATE_ADDRESS)
    daq.start_daq_loop(PI_PLATE_ADDRESS)
except (KeyboardInterrupt, SystemExit):
    daq.shutdown()
except Exception as e:
    daq.log(e)
    daq.shutdown()
    raise
