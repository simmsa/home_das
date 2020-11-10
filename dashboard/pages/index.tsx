import React from "react";

import { formatDistance } from "date-fns";
import sqlite3 from "sqlite3";

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
  gallonsPumped: number;
};

type DosingPumpRecords = Array<DosingPumpRecord>;

type HomeProps = {
  dosingPumpRecords: DosingPumpRecords;
};

function Home({ dosingPumpRecords }: HomeProps) {
  return (
    <div className="container">
      <Head>
        <title>Create Next App</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main>
        <div>
          {dosingPumpRecords.map((record: DosingPumpRecord) => {
            return (
              <div key={record.timestamp}>
                <div>
                  {formatDistance(
                    parse(
                      "YYYY-MM-DD HH:MMss",
                      record.timestamp.split(".")[0],
                      new Date()
                    ),
                    new Date()
                  )}
                </div>
                <div>{`${record.gallonsPumped} G`}</div>
              </div>
            );
          })}
        </div>
        <h1 className="title">
          Welcome to <a href="https://nextjs.org">Next.js!</a>
        </h1>

        <p className="description">
          Get started by editing <code>pages/index.js</code>
        </p>

        <div className="grid">
          <a href="https://nextjs.org/docs" className="card">
            <h3>Documentation &rarr;</h3>
            <p>Find in-depth information about Next.js features and API.</p>
          </a>

          <a href="https://nextjs.org/learn" className="card">
            <h3>Learn &rarr;</h3>
            <p>Learn about Next.js in an interactive course with quizzes!</p>
          </a>

          <a
            href="https://github.com/vercel/next.js/tree/master/examples"
            className="card"
          >
            <h3>Examples &rarr;</h3>
            <p>Discover and deploy boilerplate example Next.js projects.</p>
          </a>

          <a
            href="https://vercel.com/import?filter=next.js&utm_source=create-next-app&utm_medium=default-template&utm_campaign=create-next-app"
            className="card"
          >
            <h3>Deploy &rarr;</h3>
            <p>
              Instantly deploy your Next.js site to a public URL with Vercel.
            </p>
          </a>
        </div>
      </main>

      <footer>
        <a
          href="https://vercel.com?utm_source=create-next-app&utm_medium=default-template&utm_campaign=create-next-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          Powered by{" "}
          <img src="/vercel.svg" alt="Vercel Logo" className="logo" />
        </a>
      </footer>
    </div>
  );
}

export default Home;
