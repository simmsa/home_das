# import copy
# import datetime
import sqlite3 as db
import time

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
data_rate_hz = 120  # Is this too much?

data = []


def setup_db():
    connection = db.connect("home_das_data.db")

    with connection:
        cursor = connection.cursor()
        cursor.execute()

    return connection


def acquire_data():
    all_data = das.getADCall(das_address)
    # this_data = copy.deepcopy(data_schema)

    # for index, value in enumerate(all_data):
    #     this_data[index]["voltage"] = value

    # data.push([datetime.now(), all_data])
    return all_data


def log_data():
    return True


loop_time = 0
one_sample_time = 1000000 // 120


def get_current_microsecond():
    return time.time_ns() // 1000


def has_time_passed(loop_time):
    if (get_current_microsecond() - loop_time) > one_sample_time:
        return True
    return False


while(True):
    if(has_time_passed):
        data = acquire_data()
        print(loop_time - get_current_microsecond())
        loop_time = get_current_microsecond()
