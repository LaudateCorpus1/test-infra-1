import { useRouter } from "next/router";
import _ from "lodash";

import React, {
  useState,
  useContext,
  createContext,
  useEffect,
  useCallback,
} from "react";
import Link from "next/link";

import styles from "components/hud.module.css";
import {
  formatHudUrlForRoute,
  GroupData,
  HudParams,
  JobData,
  packHudParams,
  RowData,
} from "lib/types";
import { LocalTimeHuman } from "components/TimeUtils";
import TooltipTarget from "components/TooltipTarget";
import JobConclusion from "components/JobConclusion";
import JobTooltip from "components/JobTooltip";
import JobFilterInput from "components/JobFilterInput";
import useHudData from "lib/useHudData";
import { classifyGroup } from "lib/JobClassifierUtil";

import HudGroupedCell from "components/GroupJobConclusion";

const useGroupedView = true;

function includesCaseInsensitive(value: string, pattern: string): boolean {
  return value.toLowerCase().includes(pattern.toLowerCase());
}

function JobCell({ sha, job }: { sha: string; job: JobData }) {
  const [pinnedId, setPinnedId] = useContext(PinnedTooltipContext);
  return (
    <td onDoubleClick={() => window.open(job.htmlUrl)}>
      <TooltipTarget
        id={`${sha}-${job.name}`}
        pinnedId={pinnedId}
        setPinnedId={setPinnedId}
        tooltipContent={<JobTooltip job={job} />}
      >
        <JobConclusion conclusion={job.conclusion} />
      </TooltipTarget>
    </td>
  );
}

function HudRow({ rowData }: { rowData: RowData }) {
  const sha = rowData.sha;
  return (
    <tr>
      <td className={styles.jobMetadata}>
        <LocalTimeHuman timestamp={rowData.time} />
      </td>
      <td className={styles.jobMetadata}>
        <a href={rowData.commitUrl}>{sha.substring(0, 7)}</a>
      </td>
      <td className={styles.jobMetadata}>
        <div className={styles.jobMetadataTruncated}>
          {/* here, we purposefully do not use Link/. The prefetch behavior
          (even with prefetch disabled) spams our backend).*/}
          <a href={`/commit/${sha}`}>{rowData.commitMessage}</a>
        </div>
      </td>
      <td className={styles.jobMetadata}>
        {rowData.prNum !== null && (
          <a href={`https://github.com/pytorch/pytorch/pull/${rowData.prNum}`}>
            #{rowData.prNum}
          </a>
        )}
      </td>
      <HudJobCells rowData={rowData} />
    </tr>
  );
}

function HudJobCells({ rowData }: { rowData: RowData }) {
  if (!useGroupedView) {
    return (
      <>
        {rowData.jobs.map((job: JobData) => (
          <JobCell sha={rowData.sha} key={job.name} job={job} />
        ))}
      </>
    );
  } else {
    return (
      <>
        {rowData.groupedJobs.map((group, ind) => {
          return (
            <HudGroupedCell sha={rowData.sha} key={ind} groupData={group} />
          );
        })}
      </>
    );
  }
}

function HudTableColumns({
  names,
  filter,
}: {
  names: string[];
  filter: string | null;
}) {
  return (
    <colgroup>
      <col className={styles.colTime} />
      <col className={styles.colSha} />
      <col className={styles.colCommit} />
      <col className={styles.colPr} />
      {names.map((name: string) => {
        const passesFilter =
          filter === null || includesCaseInsensitive(name, filter);
        const style = passesFilter ? {} : { visibility: "collapse" as any };

        return <col className={styles.colJob} key={name} style={style} />;
      })}
    </colgroup>
  );
}

function HudTableHeader({
  names,
  filter,
}: {
  names: string[];
  filter: string | null;
}) {
  return (
    <thead>
      <tr>
        <th className={styles.regularHeader}>Time</th>
        <th className={styles.regularHeader}>SHA</th>
        <th className={styles.regularHeader}>Commit</th>
        <th className={styles.regularHeader}>PR</th>
        {names.map((name) => {
          const passesFilter =
            filter === null || includesCaseInsensitive(name, filter);
          const style = passesFilter ? {} : { visibility: "collapse" as any };
          return (
            <th className={styles.jobHeader} key={name} style={style}>
              <div className={styles.jobHeaderName}>{name}</div>
            </th>
          );
        })}
      </tr>
    </thead>
  );
}

function HudTableBody({ shaGrid }: { shaGrid: RowData[] }) {
  return (
    <tbody>
      {shaGrid.map((row: RowData) => (
        <HudRow key={row.sha} rowData={row} />
      ))}
    </tbody>
  );
}

function FilterableHudTable({
  params,
  jobNames,
  children,
}: {
  params: HudParams;
  jobNames: string[];
  children: React.ReactNode;
}) {
  const router = useRouter();

  const [jobFilter, setJobFilter] = useState<string | null>(null);
  // null and empty string both correspond to no filter; otherwise lowercase it
  // to make the filter case-insensitive.
  const normalizedJobFilter =
    jobFilter === null || jobFilter === "" ? null : jobFilter.toLowerCase();

  useEffect(() => {
    document.addEventListener("keydown", (e) => {
      if (e.code === "Escape") {
        setJobFilter(null);
      }
    });
  }, []);
  const handleInput = useCallback((f) => setJobFilter(f), []);
  const handleSubmit = useCallback(() => {
    if (jobFilter === "") {
      router.push(formatHudUrlForRoute("hud", params), undefined, {
        shallow: true,
      });
    } else {
      router.push(
        formatHudUrlForRoute("hud", {
          ...params,
          nameFilter: jobFilter ?? undefined,
        }),
        undefined,
        {
          shallow: true,
        }
      );
    }
  }, [params, router, jobFilter]);

  // We have to use an effect hook here because query params are undefined at
  // static generation time; they only become available after hydration.
  useEffect(() => {
    const filterValue = (router.query.name_filter as string) || "";
    setJobFilter(filterValue);
    handleInput(filterValue);
  }, [router.query.name_filter, handleInput]);

  return (
    <>
      <JobFilterInput
        currentFilter={jobFilter}
        handleSubmit={handleSubmit}
        handleInput={handleInput}
      />

      <table className={styles.hudTable}>
        <HudTableColumns filter={normalizedJobFilter} names={jobNames} />
        <HudTableHeader filter={normalizedJobFilter} names={jobNames} />
        {children}
      </table>
    </>
  );
}

function HudTable({ params }: { params: HudParams }) {
  return <GroupView params={params} />;
  // const data = useHudData(params);
  // if (data === undefined) {
  //   return <div>Loading...</div>;
  // }
  // const { shaGrid, jobNames } = data;

  // // Here, we are intentionally injecting HudTableBody into the
  // // FilterableHudTable component. This is for rendering performance; we don't
  // // want React to re-render the whole table every time the filter changes.
  // return (

  //   <FilterableHudTable params={params} jobNames={jobNames}>
  //     <HudTableBody shaGrid={shaGrid} />
  //   </FilterableHudTable>
  // );
}

function PageSelector({ params }: { params: HudParams }) {
  return (
    <div>
      Page {params.page}:{" "}
      {params.page !== 0 ? (
        <span>
          <Link
            href={formatHudUrlForRoute("hud", {
              ...params,
              page: params.page - 1,
            })}
          >
            Prev
          </Link>{" "}
          |{" "}
        </span>
      ) : null}
      <Link
        href={formatHudUrlForRoute("hud", { ...params, page: params.page + 1 })}
      >
        Next
      </Link>
    </div>
  );
}

function ParamSelector({
  value,
  handleSubmit,
}: {
  value: string;
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  const [isInput, setIsInput] = useState(false);
  if (isInput) {
    return (
      <form
        className={styles.branchForm}
        onSubmit={handleSubmit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setIsInput(false);
          }
        }}
      >
        <input autoFocus className={styles.branchFormInput} type="text"></input>
      </form>
    );
  }

  return (
    <code style={{ cursor: "pointer" }} onClick={() => setIsInput(true)}>
      {value}
    </code>
  );
}

function HudHeader({ params }: { params: HudParams }) {
  function handleBranchSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // @ts-ignore
    const branch = e.target[0].value;
    window.location.href = formatHudUrlForRoute("hud", { ...params, branch });
  }
  function handleRepoSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // @ts-ignore
    const repoOwnerAndName = e.target[0].value;
    const split = repoOwnerAndName.split("/");
    window.location.href = formatHudUrlForRoute("hud", {
      ...params,
      repoOwner: split[0],
      repoName: split[1],
    });
  }

  return (
    <h1>
      <ParamSelector
        value={`${params.repoOwner}/${params.repoName}`}
        handleSubmit={handleRepoSubmit}
      />
      :{" "}
      <ParamSelector value={params.branch} handleSubmit={handleBranchSubmit} />
    </h1>
  );
}

export const PinnedTooltipContext = createContext<[null | string, any]>([
  null,
  null,
]);

export default function Hud() {
  const router = useRouter();

  // Logic to handle tooltip pinning. The behavior we want is:
  // - If the user clicks on a tooltip, it should be pinned.
  // - While a tooltip is pinned, we don't show any other tooltips.
  // - Clicking outside the tooltip or pressing esc should unpin it.
  // This state needs to be set up at this level because we want to capture all
  // clicks.
  const [pinnedTooltip, setPinnedTooltip] = useState<string | null>(null);
  function handleClick() {
    setPinnedTooltip(null);
  }
  useEffect(() => {
    document.addEventListener("keydown", (e) => {
      if (e.code === "Escape") {
        setPinnedTooltip(null);
      }
    });
  }, []);

  const params = packHudParams(router.query);

  return (
    <PinnedTooltipContext.Provider value={[pinnedTooltip, setPinnedTooltip]}>
      {params.branch !== undefined && (
        <div onClick={handleClick}>
          <HudHeader params={params} />
          <div>This page automatically updates.</div>
          <div>
            <PageSelector params={params} />
            <HudTable params={params} />
          </div>
        </div>
      )}
    </PinnedTooltipContext.Provider>
  );
}
function GroupView({ params }: { params: HudParams }) {
  const data = useHudData(params);
  if (data === undefined) {
    return <div>Loading...</div>;
  }
  const { shaGrid, jobNames } = data;

  // Construct Job Groupping Mapping
  const groupNames = new Map<string, Array<string>>();
  const jobToGroupName = new Map<string, string>();
  for (const name of jobNames) {
    const groupName = classifyGroup(name);
    const jobsInGroup = groupNames.get(groupName) ?? [];
    jobsInGroup.push(name);
    groupNames.set(groupName, jobsInGroup);
    jobToGroupName.set(name, groupName);
  }
  const groupNamesArray = Array.from(groupNames.keys());

  // Group Jobs per Row
  for (const row of shaGrid) {
    const groupedJobs = new Map<string, GroupData>();
    for (const groupName of groupNamesArray) {
      groupedJobs.set(groupName, { groupName, jobs: [] });
    }
    for (const job of row.jobs) {
      const groupName = jobToGroupName.get(job.name!)!;
      groupedJobs.get(groupName)!.jobs.push(job);
    }
    const groupDataRow: GroupData[] = [];
    for (const groupName of groupNamesArray) {
      groupDataRow.push(groupedJobs.get(groupName)!);
    }
    row.groupedJobs = groupDataRow;
  }

  return (
    <FilterableHudTable params={params} jobNames={groupNamesArray}>
      <HudTableBody shaGrid={shaGrid} />
    </FilterableHudTable>
  );
}
