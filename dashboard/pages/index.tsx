import React from "react";

import { formatDistance } from "date-fns";
import parse from "date-fns/parse";
import format from "date-fns/format";
import sqlite3 from "sqlite3";
import { ResponsiveCalendar } from "@nivo/calendar";

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

// <div>{formatDistance(timestampTime, new Date())}</div>
function Home({ dosingPumpRecords }: HomeProps) {
  const calendarData = dosingPumpRecords.map((record: DosingPumpRecord) => {
    const timestampTime = parse(
      record.timestamp.split(".")[0],
      "yyyy-MM-dd HH:mm:ss",
      new Date()
    );
    const timeForCal = format(timestampTime, "yyyy-MM-dd");
    return {
      day: timeForCal,
      value: record.gallons_pumped
    };
  });
  return (
    <div className="container">
      <div style={{ height: "400px" }}>
        <ResponsiveCalendar
          data={calendarData}
          from={calendarData[0].day}
          to={calendarData[calendarData.length - 1].day}
          colors={["#90CAF9", "#42A5F5", "#1E88E5", "#1565C0", "#0D47A1"]}
        />
      </div>
      <div>
        {dosingPumpRecords.map((record: DosingPumpRecord) => {
          const timestampTime = parse(
            record.timestamp.split(".")[0],
            "yyyy-MM-dd HH:mm:ss",
            new Date()
          );
          console.log(timestampTime);
          return (
            <div key={record.timestamp}>
              <div>{`${formatDistance(timestampTime, new Date())} ago`}</div>
              <div>{`${record.gallons_pumped.toFixed(2)} G`}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default Home;
