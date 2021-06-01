import React from "react";

import clsx from "clsx";
import { formatDistance } from "date-fns";
import parse from "date-fns/parse";
import format from "date-fns/format";
import add from "date-fns/add";
import sub from "date-fns/sub";
import compareAsc from "date-fns/compareAsc";
import intervalToDuration from "date-fns/intervalToDuration";
import differenceInSeconds from "date-fns/differenceInSeconds";
import differenceInDays from "date-fns/differenceInDays";
import formatDuration from "date-fns/formatDuration";
import startOfQuarter from "date-fns/startOfQuarter";
import isAfter from "date-fns/isAfter";
import isEqual from "date-fns/isEqual";
import isBefore from "date-fns/isBefore";
import sqlite3 from "sqlite3";
import { BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar } from "recharts";
import { ResponsiveCalendar } from "@nivo/calendar";
import {
  createMuiTheme,
  createStyles,
  withStyles,
  WithStyles,
  Theme,
  ThemeProvider,
} from "@material-ui/core/styles";
import blue from "@material-ui/core/colors/blue";
import {
  DataGrid,
  GridCellClassParams,
  GridValueFormatterParams,
} from "@material-ui/data-grid";
import { Typography } from "@material-ui/core";
import Paper from "@material-ui/core/Paper";
import Box from "@material-ui/core/Box";
import Divider from "@material-ui/core/Divider";
import AppBar from "@material-ui/core/AppBar";
import Toolbar from "@material-ui/core/Toolbar";
import Button from "@material-ui/core/Button";
import IconButton from "@material-ui/core/IconButton";
import NavigateNextIcon from "@material-ui/icons/NavigateNext";
import NavigateBeforeIcon from "@material-ui/icons/NavigateBefore";
import ButtonGroup from "@material-ui/core/ButtonGroup";

import Head from "next/head";

export async function getServerSideProps() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database("/home/pi/home_das/home_das_db.db");
    // const db = new sqlite3.Database(
    //   "/Users/macuser/Desktop/Programming/python/home_das/home_das_db.db"
    // );
    db.serialize(() => {
      db.all("SELECT * from WATER_USAGE_DATA", function (err, rows) {
        if (err) {
          reject(err);
        }
        resolve({ props: { dosingPumpRecords: rows } });
      });
    });
  });
}

// From a pump run witnessed on Jan 31 21
// The liquid level in the tank went from
// 26 and 11/16" to 16 1/2"
// This does not include transport volume
// The pump ran for 190.4 seconds
const derivedGallonsPerSecond = (): number => {
  // 26 11/16"
  const maxFill = 261 + (274 - 261) * (11 / 16);
  // 16 1/2"
  const minFill = 138 + (150 - 138) * 0.5;
  const derivedDose = maxFill - minFill;
  const actualSeconds = 190.4;
  const derivedGallonsPerSecond = derivedDose / actualSeconds;
  return derivedGallonsPerSecond;
};

const actualGallonsPerSecond = derivedGallonsPerSecond();

const transportVolume = 12.8; // Gallons
const calcActualDosedValue = (originalDosedGallons: number): number => {
  const fullDose = Math.abs(originalDosedGallons) + transportVolume;
  const pumpGallonsPerSecond = 0.725;
  const dosedSeconds = fullDose / pumpGallonsPerSecond;

  const newFullDose = dosedSeconds * actualGallonsPerSecond;
  return newFullDose - transportVolume;
};

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
  b: DosingPumpRecord
): number {
  return compareTimestamps(a.timestamp, b.timestamp);
}

const parseSqliteTimestamp = (timestamp: string): Date => {
  return parse(timestamp.split(".")[0], "yyyy-MM-dd HH:mm:ss", new Date());
};

const waterBlue = "#1E88E5";
const theme = createMuiTheme({
  palette: {
    primary: {
      main: blue[500],
    },
    secondary: {
      main: blue[500],
    },
  },
});

const styles = (theme: Theme) =>
  createStyles({
    root: {
      flexGrow: 1,
      "& .super-app.negative": {
        color: "#d32f2f",
        fontWeight: "600",
      },
      "& .super-app.positive": {
        color: "#388e3c",
        fontWeight: "600",
      },
    },
    appBarTitle: {
      flexGrow: 1,
    },
    appBarDate: {
      marginRight: theme.spacing(2),
    },
  });

type SectionTitleProps = {
  size?: number;
  children?: React.ReactNode;
};

const SectionTitle = (props: SectionTitleProps) => {
  return (
    <Typography
      align="center"
      color="textPrimary"
      display="block"
      variant="button"
      style={{
        fontSize: `${props.size ? props.size : 16}px`,
      }}
    >
      {props.children}
    </Typography>
  );
};

type PayPeriod = {
  name: string;
  start: Date;
  end: Date;
  numDays: number;
};

// Generate pay periods up to the current date
const getPayPeriods = (): PayPeriod[] => {
  const firstPayPeriod = new Date(2020, 9, 1);
  const monthsBetweenPayPeriods = 4;
  const result = [];
  let payPeriod = firstPayPeriod;

  while (compareAsc(payPeriod, new Date()) === -1) {
    const nextPayPeriodStart = add(payPeriod, {
      months: monthsBetweenPayPeriods,
    });
    const payPeriodEnd = sub(nextPayPeriodStart, { minutes: 1 });

    const startAndEndInSameYear =
      format(payPeriod, "u") === format(payPeriodEnd, "u");

    const startFormat = startAndEndInSameYear
      ? format(payPeriod, "MMM")
      : format(payPeriod, "MMM u");

    result.push({
      name: `${startFormat} - ${format(payPeriodEnd, "MMM u")}`,
      start: payPeriod,
      end: payPeriodEnd,
      numDays: differenceInDays(payPeriodEnd, payPeriod),
    });
    payPeriod = nextPayPeriodStart;
  }
  return result;
};

const payPeriods: PayPeriod[] = getPayPeriods();

const getPayPeriodNameFromTimestamp = (timestamp: Date): string => {
  let result = "bad pay period";
  payPeriods.map((payPeriod: PayPeriod) => {
    if (
      isEqual(timestamp, payPeriod.start) ||
      isEqual(timestamp, payPeriod.end)
    ) {
      result = payPeriod.name;
    } else if (
      isAfter(timestamp, payPeriod.start) &&
      isBefore(timestamp, payPeriod.end)
    ) {
      result = payPeriod.name;
    }
  });
  return result;
};

type HomeState = {
  usageDataIndex: number;
};

interface HomeStyledProps extends WithStyles<typeof styles> {
  dosingPumpRecords: DosingPumpRecords;
}

class Home extends React.Component<HomeStyledProps, HomeState> {
  usageDataIndexMax = payPeriods.length - 1;
  usageDataIndexMin = 0;
  constructor(props: HomeStyledProps) {
    super(props);
    this.state = {
      usageDataIndex: payPeriods.length - 1,
    };
  }

  updateUsageDataIndex(updatedIndex: number) {
    let newIndex = updatedIndex;

    if (newIndex > this.usageDataIndexMax) {
      newIndex = this.usageDataIndexMax;
    }

    if (newIndex < this.usageDataIndexMin) {
      newIndex = this.usageDataIndexMin;
    }

    this.setState({
      usageDataIndex: newIndex,
    });
  }

  render() {
    const { dosingPumpRecords, classes } = this.props;
    const calDataDict: CalDataDict = {};
    const dayOfWeekDict: DayOfWeekDict = {};
    const thisPayPeriod: PayPeriod = payPeriods[payPeriods.length - 1];
    const thisPayPeriodStart = thisPayPeriod.start;
    const thisPayPeriodEnd = thisPayPeriod.end;
    let gallonsPumpedThisPayPeriod = 0;

    type PayPeriodData = {
      total_gallons_dosed: number;
      average_daily_gallons_dosed: number;
      estimated_gallons_dosed: number;
      days: number;
      start: Date;
      end: Date;
      mostRecentDosingPumpRun: Date;
    };

    const payPeriodData: { [key: string]: PayPeriodData } = {};
    payPeriods.map((payPeriod: PayPeriod) => {
      payPeriodData[payPeriod.name] = {
        total_gallons_dosed: 0,
        average_daily_gallons_dosed: 0,
        estimated_gallons_dosed: 0,
        days: payPeriod.numDays,
        start: payPeriod.start,
        end: payPeriod.end,
        mostRecentDosingPumpRun: payPeriod.start,
      };
    });

    const completeCalData = dosingPumpRecords.map(
      (record: DosingPumpRecord) => {
        const timestampTime = parseSqliteTimestamp(record.timestamp);
        const timeForCal = format(timestampTime, "yyyy-MM-dd");
        const actualGallonsPumped = calcActualDosedValue(record.gallons_pumped);
        if (calDataDict.hasOwnProperty(timeForCal)) {
          calDataDict[timeForCal] =
            calDataDict[timeForCal] + actualGallonsPumped;
        } else {
          calDataDict[timeForCal] = actualGallonsPumped;
        }

        const dayOfWeek = format(timestampTime, "EEEE");
        if (dayOfWeekDict.hasOwnProperty(dayOfWeek)) {
          dayOfWeekDict[dayOfWeek] =
            dayOfWeekDict[dayOfWeek] + actualGallonsPumped;
        } else {
          dayOfWeekDict[dayOfWeek] = actualGallonsPumped;
        }

        if (isAfter(timestampTime, thisPayPeriodStart)) {
          gallonsPumpedThisPayPeriod += actualGallonsPumped;
        }

        const payPeriodName = getPayPeriodNameFromTimestamp(timestampTime);
        payPeriodData[payPeriodName].total_gallons_dosed += actualGallonsPumped;

        return {
          day: timeForCal,
          value: actualGallonsPumped,
        };
      }
    );

    Object.keys(payPeriodData).map((key) => {
      let daysForAverage = payPeriodData[key].days;
      if (isAfter(payPeriodData[key].end, new Date())) {
        daysForAverage = differenceInDays(new Date(), payPeriodData[key].start);
      }
      payPeriodData[key].average_daily_gallons_dosed =
        payPeriodData[key].total_gallons_dosed / daysForAverage;
      payPeriodData[key].estimated_gallons_dosed =
        payPeriodData[key].average_daily_gallons_dosed *
        payPeriodData[key].days;
    });

    const payPeriodGallonsPerDay =
      gallonsPumpedThisPayPeriod /
      differenceInDays(new Date(), thisPayPeriodStart);

    const formattedCalData = Object.keys(calDataDict).map((key) => {
      return { day: key, value: calDataDict[key] };
    });

    const payPeriodDataKeys = Object.keys(payPeriodData);

    const parseDate = (timestamp: string): Date => {
      return parse(timestamp.split(".")[0], "yyyy-MM-dd HH:mm:ss", new Date());
    };

    let lastRuntime: Date = parseDate(dosingPumpRecords[0].timestamp);
    let allSecondsBetween: number[] = [];
    let allGallonsPumped: number[] = [];
    const dosingPumpRecordsWithId = dosingPumpRecords
      .reverse()
      .map((record: DosingPumpRecord, x: number) => {
        const actualGallonsPumped = calcActualDosedValue(record.gallons_pumped);
        const timestampTime: Date = parseDate(record.timestamp);
        const hoursBetween = intervalToDuration({
          start: timestampTime,
          end: lastRuntime,
        });
        const secondsBetween = differenceInSeconds(timestampTime, lastRuntime);
        allSecondsBetween.push(secondsBetween);
        allGallonsPumped.push(actualGallonsPumped);
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
          gallons_pumped: parseFloat(actualGallonsPumped.toFixed(3)),
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
        headerName: "Gallons Dosed",
        width: 200,
        description: "Derived from number of seconds the pump runs",
        cellClassName: (params: GridCellClassParams) =>
          clsx("super-app", {
            negative: (params.value as number) > gallonsPumpedMedian * 1.1,
          }),
      },
    ];
    const now = new Date();
    return (
      <ThemeProvider theme={theme}>
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
          <AppBar position="static" style={{ backgroundColor: waterBlue }}>
            <Toolbar>
              <Typography className={classes.appBarTitle} variant="button">
                25482 Westridge Rd - Dosing Tank Records
              </Typography>
              <Typography className={classes.appBarDate}>
                {format(now, "PPpp")}
              </Typography>
            </Toolbar>
          </AppBar>
          <div className="container">
            <Paper
              elevation={3}
              style={{
                padding: "15px",
                margin: "25px 0 25px 0",
                width: "820px",
              }}
            >
              {this.state.usageDataIndex === this.usageDataIndexMax ? (
                <SectionTitle size={32}>Active Pay Period</SectionTitle>
              ) : null}
              <SectionTitle size={32}>
                {payPeriodDataKeys[this.state.usageDataIndex]}
              </SectionTitle>
              {this.state.usageDataIndex === this.usageDataIndexMax ? (
                <SectionTitle>
                  Gallons Dosed This Pay Period (
                  {differenceInDays(now, thisPayPeriodStart)} Days Since{" "}
                  {thisPayPeriodStart.toLocaleDateString("en-US")}):{" "}
                </SectionTitle>
              ) : (
                <SectionTitle>Total Gallons Dosed</SectionTitle>
              )}
              <Typography variant="h2" component="h2" align="center">
                <b>
                  {payPeriodData[
                    payPeriodDataKeys[this.state.usageDataIndex]
                  ].total_gallons_dosed.toFixed(2)}
                </b>
              </Typography>
              {this.state.usageDataIndex === this.usageDataIndexMax ? (
                <SectionTitle>
                  Gallons Dosed Per Day This Pay Period ({}Since{" "}
                  {thisPayPeriodStart.toLocaleDateString("en-US")}):{" "}
                </SectionTitle>
              ) : (
                <SectionTitle>Average Gallons Dosed Per Day</SectionTitle>
              )}
              <Typography variant="h2" component="h2" align="center">
                <b>
                  {payPeriodData[
                    payPeriodDataKeys[this.state.usageDataIndex]
                  ].average_daily_gallons_dosed.toFixed(2)}
                </b>
              </Typography>
              {this.state.usageDataIndex === this.usageDataIndexMax ? (
                <>
                  <SectionTitle>
                    Estimated Gallons to be Dosed This Pay Period (
                    {thisPayPeriod.start.toLocaleDateString("en-US")} to{" "}
                    {thisPayPeriod.end.toLocaleDateString("en-US")}):{" "}
                  </SectionTitle>
                  <Typography variant="h2" component="h2" align="center">
                    <b>
                      {payPeriodData[
                        payPeriodDataKeys[this.state.usageDataIndex]
                      ].estimated_gallons_dosed.toFixed(2)}
                    </b>
                  </Typography>
                </>
              ) : null}
              <Box display="flex" alignItems="center" justifyContent="center">
                <ButtonGroup
                  variant="outlined"
                  size="small"
                  style={{ marginTop: theme.spacing(2) }}
                  disableRipple={true}
                >
                  <Button
                    disabled={this.state.usageDataIndex === 0}
                    onClick={() => {
                      this.updateUsageDataIndex(this.state.usageDataIndex - 1);
                    }}
                  >
                    <NavigateBeforeIcon />
                  </Button>
                  {payPeriodDataKeys.map((key, index) => {
                    return (
                      <Button
                        key={key}
                        style={{
                          fontWeight:
                            index === this.state.usageDataIndex
                              ? "bold"
                              : "normal",
                        }}
                        onClick={() => {
                          this.updateUsageDataIndex(
                            payPeriodDataKeys.indexOf(key)
                          );
                        }}
                      >
                        {key}
                      </Button>
                    );
                  })}
                  <Button
                    disabled={
                      this.state.usageDataIndex === this.usageDataIndexMax
                    }
                    onClick={() => {
                      this.updateUsageDataIndex(this.state.usageDataIndex + 1);
                    }}
                  >
                    <NavigateNextIcon />
                  </Button>
                </ButtonGroup>
              </Box>
            </Paper>
            <Paper
              elevation={3}
              style={{ padding: "10px", marginBottom: "25px" }}
            >
              <SectionTitle>
                Gallons Dosed Per Day Of Week (All Time)
              </SectionTitle>

              <BarChart
                width={800}
                height={250}
                margin={{ top: 15, right: 15, left: 15, bottom: 15 }}
                data={dayOrder.map((day) => {
                  return {
                    day,
                    "Gallons Dosed": dayOfWeekDict[day].toFixed(2),
                  };
                })}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="Gallons Dosed" fill="#1E88E5" />
              </BarChart>
            </Paper>
            <Paper
              elevation={3}
              style={{ padding: "10px", marginBottom: "25px" }}
            >
              <SectionTitle>
                Gallons Dosed Per Day Of Year (All Time)
              </SectionTitle>
              <div
                style={{ height: "350px", width: "800px", paddingTop: "15px" }}
              >
                <ResponsiveCalendar
                  data={formattedCalData}
                  from={completeCalData[completeCalData.length - 1].day}
                  to={completeCalData[0].day}
                  colors={[
                    "#90CAF9",
                    "#42A5F5",
                    "#1E88E5",
                    "#1565C0",
                    "#0D47A1",
                  ]}
                  margin={{ left: 40, right: 40 }}
                  yearSpacing={40}
                />
              </div>
            </Paper>
            <Paper elevation={3} style={{ padding: "15px" }}>
              <SectionTitle>Dosing Tank Logs</SectionTitle>
              <div style={{ width: "1000px" }} className={classes.root}>
                <DataGrid
                  rows={dosingPumpRecordsWithId}
                  columns={dataColumns}
                  autoHeight={true}
                />
              </div>
            </Paper>
          </div>
        </div>
      </ThemeProvider>
    );
  }
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

export default withStyles(styles, { withTheme: true })(Home);
