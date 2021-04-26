import React from "react";

import clsx from "clsx";
import { formatDistance } from "date-fns";
import parse from "date-fns/parse";
import format from "date-fns/format";
import intervalToDuration from "date-fns/intervalToDuration";
import differenceInSeconds from "date-fns/differenceInSeconds";
import formatDuration from "date-fns/formatDuration";
import startOfQuarter from "date-fns/startOfQuarter";
import isAfter from "date-fns/isAfter";
import sqlite3 from "sqlite3";
import { BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar } from "recharts";
import { ResponsiveCalendar } from "@nivo/calendar";
import { ResponsiveBar } from "@nivo/bar";
import { makeStyles } from "@material-ui/core/styles";
import {
  DataGrid,
  GridCellClassParams,
  GridValueFormatterParams,
} from "@material-ui/data-grid";

import Head from "next/head";

export async function getServerSideProps() {
  return new Promise((resolve, reject) => {
    let db = new sqlite3.Database("/home/pi/home_das/home_das_db.db");
    // let db = new sqlite3.Database(
    //   "/Users/macuser/Desktop/Programming/python/home_das/home_das_db.db",
    // );
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
  "Sunday",
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
  b: DosingPumpRecord,
): number {
  return compareTimestamps(a.timestamp, b.timestamp);
}

const parseSqliteTimestamp = (timestamp: string): Date => {
  return parse(timestamp.split(".")[0], "yyyy-MM-dd HH:mm:ss", new Date());
};

const useStyles = makeStyles({
  root: {
    "& .super-app.negative": {
      color: "#d50000",
      fontWeight: "600",
    },
    "& .super-app.positive": {
      color: "#00c853",
      fontWeight: "600",
    },
  },
});

function Home({ dosingPumpRecords }: HomeProps) {
  const classes = useStyles();
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
      value: record.gallons_pumped,
    };
  });

  const formattedCalData = Object.keys(calDataDict).map(key => {
    return { day: key, value: calDataDict[key] };
  });

  const parseDate = (timestamp: string): Date => {
    return parse(timestamp.split(".")[0], "yyyy-MM-dd HH:mm:ss", new Date());
  };

  let lastRuntime: Date = parseDate(dosingPumpRecords[0].timestamp);
  let allSecondsBetween: number[] = [];
  let allGallonsPumped: number[] = [];
  const dosingPumpRecordsWithId = dosingPumpRecords
    .reverse()
    .map((record: DosingPumpRecord, x: number) => {
      const timestampTime: Date = parseDate(record.timestamp);
      const hoursBetween = intervalToDuration({
        start: timestampTime,
        end: lastRuntime,
      });
      const secondsBetween = differenceInSeconds(timestampTime, lastRuntime);
      allSecondsBetween.push(secondsBetween);
      allGallonsPumped.push(record.gallons_pumped);
      lastRuntime = timestampTime;
      return {
        ...record,
        timeSince: formatDistance(timestampTime, new Date()) + " ago",
        timestamp: format(timestampTime, "PPpp"),
        hoursBetween: formatDuration(hoursBetween, {
          format: ["years", "months", "weeks", "days", "hours", "minutes"],
        }),
        secondsBetween,
        id: x,
        gallons_pumped: parseFloat(record.gallons_pumped.toFixed(3)),
      };
    })
    .reverse();

  let total = 0;
  for (let i = 0; i < allSecondsBetween.length; i++) {
    total += Math.abs(allSecondsBetween[i]);
  }
  const secondsBetweenAverage = total / allSecondsBetween.length;

  const median = (arr: number[]) => {
    const mid = Math.floor(arr.length / 2),
      nums = [...arr].sort((a, b) => a - b);
    return arr.length % 2 !== 0 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
  };
  const secondsBetweenMedian = median(allSecondsBetween);
  const gallonsPumpedMedian = median(allGallonsPumped);

  const dataColumns = [
    {
      field: "id",
      headerName: "Count",
      width: 120,
      description: "Pump Count",
    },
    {
      field: "timestamp",
      headerName: "Time",
      width: 220,
      description: "Timestamp when pump started",
    },
    {
      field: "timeSince",
      headerName: "Time Since",
      width: 200,
      description: "Timestamp when pump started",
    },
    {
      field: "secondsBetween",
      headerName: "Duration Between",
      width: 170,
      cellClassName: (params: GridCellClassParams) =>
        clsx("super-app", {
          negative: (params.value as number) < secondsBetweenMedian * 0.75,
          positive: (params.value as number) > secondsBetweenMedian * 1.25,
        }),
      valueFormatter: (params: GridValueFormatterParams) => {
        const thisDuration = intervalToDuration({
          start: 0,
          end: (params.value as number) * 1000,
        });
        return formatDuration(thisDuration);
      },
    },
    {
      field: "gallons_pumped",
      headerName: "Gallons Pumped",
      width: 200,
      description: "Derived from number of seconds the pump runs",
      cellClassName: (params: GridCellClassParams) =>
        clsx("super-app", {
          negative: (params.value as number) > gallonsPumpedMedian * 1.1,
        }),
    },
  ];

  return (
    <div>
      <Head>
        <title>Dosing Pump Records</title>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css?family=Roboto:300,400,500,700&display=swap"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/icon?family=Material+Icons"
        />
      </Head>
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
              "Gallons Pumped": dayOfWeekDict[day].toFixed(2),
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
        <div style={{ width: "1000px" }} className={classes.root}>
          <DataGrid
            rows={dosingPumpRecordsWithId}
            columns={dataColumns}
            autoHeight={true}
          />
        </div>
      </div>
    </div>
  );
}
// <h3>Dosing Tank Logs</h3>
// <style global jsx>
//   {`
//     .logEntry:hover div {
//       font-weight: bold;
//     }
//   `}
// </style>
// <div>
//   {dosingPumpRecords
//     .sort(compareDosingRecords)
//     .reverse()
//     .map((record: DosingPumpRecord) => {
//       const timestampTime = parse(
//         record.timestamp.split(".")[0],
//         "yyyy-MM-dd HH:mm:ss",
//         new Date(),
//       );
//       return (
//         <div
//           className="logEntry"
//           key={record.timestamp}
//           title={record.timestamp}
//           style={{
//             width: "450px",
//             display: "flex",
//             alignItems: "center",
//             justifyContent: "space-between",
//             textTransform: "uppercase",
//             fontSize: "13px",
//             letterSpacing: "0.75px",
//             padding: "6px",
//             borderBottom: "1px solid #eee",
//           }}
//         >
//           <div className="logEntry">{`${formatDistance(
//             timestampTime,
//             new Date(),
//           )} ago:`}</div>
//           <div>{`${record.gallons_pumped.toFixed(2)} Gallons`}</div>
//           <div>{`${record.gallons_pumped.toFixed(2)} Gallons`}</div>
//         </div>
//       );
//     })}
// </div>

export default Home;
