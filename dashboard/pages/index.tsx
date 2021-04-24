import React from "react";

import { formatDistance } from "date-fns";
import parse from "date-fns/parse";
import format from "date-fns/format";
import startOfQuarter from "date-fns/startOfQuarter";
import isAfter from "date-fns/isAfter";
import sqlite3 from "sqlite3";
import { BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar } from "recharts";
import { ResponsiveCalendar } from "@nivo/calendar";
import { ResponsiveBar } from "@nivo/bar";

import Head from "next/head";

export async function getServerSideProps() {
  return new Promise((resolve, reject) => {
    let db = new sqlite3.Database("/home/pi/home_das/home_das_db.db");
    db.serialize(() => {
      db.all("SELECT * from WATER_USAGE_DATA", function(err, rows) {
        if (err) {
          reject(err);
        }
        resolve({ props: { dosingPumpRecords: rows } });
      });
    });
  });
}

type DosingPumpRecord = {
  timestamp: "string";
  gallons_pumped: number;
};

type DosingPumpRecords = Array<DosingPumpRecord>;

type HomeProps = {
  dosingPumpRecords: DosingPumpRecords;
};

type CalDataDict = {
  [date: string]: number;
};
type DayOfWeekDict = {
  [dayOfWeek: string]: number;
};

const dayOrder = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday"
];

function compareTimestamps(a: string, b: string): number {
  const aDate = parseSqliteTimestamp(a);
  const bDate = parseSqliteTimestamp(b);

  if (aDate < bDate) {
    return -1;
  }

  if (aDate > bDate) {
    return 1;
  }
  return 0;
}

function compareDosingRecords(
  a: DosingPumpRecord,
  b: DosingPumpRecord
): number {
  return compareTimestamps(a.timestamp, b.timestamp);
}

const parseSqliteTimestamp = (timestamp: string): Date => {
  return parse(timestamp.split(".")[0], "yyyy-MM-dd HH:mm:ss", new Date());
};

// <div>{formatDistance(timestampTime, new Date())}</div>
function Home({ dosingPumpRecords }: HomeProps) {
  const calDataDict: CalDataDict = {};
  const dayOfWeekDict: DayOfWeekDict = {};
  const thisQuarterStart = startOfQuarter(new Date());
  let gallonsPumpedThisQuarter = 0;
  const completeCalData = dosingPumpRecords.map((record: DosingPumpRecord) => {
    const timestampTime = parseSqliteTimestamp(record.timestamp);
    const timeForCal = format(timestampTime, "yyyy-MM-dd");
    if (calDataDict.hasOwnProperty(timeForCal)) {
      calDataDict[timeForCal] = calDataDict[timeForCal] + record.gallons_pumped;
    } else {
      calDataDict[timeForCal] = record.gallons_pumped;
    }

    const dayOfWeek = format(timestampTime, "EEEE");
    if (dayOfWeekDict.hasOwnProperty(dayOfWeek)) {
      dayOfWeekDict[dayOfWeek] =
        dayOfWeekDict[dayOfWeek] + record.gallons_pumped;
    } else {
      dayOfWeekDict[dayOfWeek] = record.gallons_pumped;
    }

    if (isAfter(timestampTime, thisQuarterStart)) {
      gallonsPumpedThisQuarter += record.gallons_pumped;
    }
    return {
      day: timeForCal,
      value: record.gallons_pumped
    };
  });

  const formattedCalData = Object.keys(calDataDict).map(key => {
    return { day: key, value: calDataDict[key] };
  });
  // console.log(calDataDict);
  // console.log(dayOfWeekDict);
  // console.log(formattedCalData);
  // console.log(completeCalData[completeCalData.length - 1].day);
  // console.log(completeCalData[0].day);
  return (
    <div className="container">
      <h1>Dosing Tank Records</h1>
      <h2>
        Gallons Pumped This Quarter:{" "}
        <b>{gallonsPumpedThisQuarter.toFixed(2)}</b>
      </h2>
      <h3>Gallons Pumped Per Day Of Week</h3>

      <BarChart
        width={800}
        height={250}
        margin={{ top: 15, right: 15, left: 15, bottom: 15 }}
        data={dayOrder.map(day => {
          return {
            day,
            "Gallons Pumped": dayOfWeekDict[day].toFixed(2)
          };
        })}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="day" />
        <YAxis />
        <Tooltip />
        <Bar dataKey="Gallons Pumped" fill="#1E88E5" />
      </BarChart>
      <h3>Gallons Pumped Per Day Of Year</h3>
      <div style={{ height: "350px", width: "800px", paddingTop: "15px" }}>
        <ResponsiveCalendar
          data={formattedCalData}
          from={completeCalData[completeCalData.length - 1].day}
          to={completeCalData[0].day}
          colors={["#90CAF9", "#42A5F5", "#1E88E5", "#1565C0", "#0D47A1"]}
          margin={{ left: 40, right: 40 }}
          yearSpacing={40}
        />
      </div>

      <h3>Dosing Tank Logs</h3>
      <style global jsx>
        {`
          .logEntry:hover div {
            font-weight: bold;
          }
        `}
      </style>
      <div>
        {dosingPumpRecords
          .sort(compareDosingRecords)
          .reverse()
          .map((record: DosingPumpRecord) => {
            const timestampTime = parse(
              record.timestamp.split(".")[0],
              "yyyy-MM-dd HH:mm:ss",
              new Date()
            );
            return (
              <div
                className="logEntry"
                key={record.timestamp}
                title={record.timestamp}
                style={{
                  width: "450px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  textTransform: "uppercase",
                  fontSize: "13px",
                  letterSpacing: "0.75px",
                  padding: "6px",
                  borderBottom: "1px solid #eee"
                }}
              >
                <div className="logEntry">{`${formatDistance(
                  timestampTime,
                  new Date()
                )} ago:`}</div>
                <div>{`${record.gallons_pumped.toFixed(2)} Gallons`}</div>
              </div>
            );
          })}
      </div>
    </div>
  );
}

export default Home;
