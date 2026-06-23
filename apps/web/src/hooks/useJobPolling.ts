import { useState, useRef, useCallback } from "react";
import { message } from "antd";
import { axiosInstance, API_URL } from "../providers/dataProvider";

interface JobPollOptions {
  onComplete?: (job: any) => void;
  onFailed?: (job: any) => void;
  interval?: number;
  successMessage?: string;
  failedMessage?: string;
}

export const useJobPolling = (options: JobPollOptions = {}) => {
  const {
    onComplete,
    onFailed,
    interval = 2000,
    successMessage = "Job completed",
    failedMessage = "Job failed",
  } = options;

  const [isPolling, setIsPolling] = useState(false);
  const [job, setJob] = useState<any>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = undefined;
    }
    setIsPolling(false);
  }, []);

  const pollJob = useCallback(
    async (jobId: string) => {
      try {
        const { data } = await axiosInstance.get(`${API_URL}/jobs/${jobId}`);
        setJob(data);

        if (data.status === "completed") {
          stopPolling();
          message.success(successMessage);
          onComplete?.(data);
        } else if (data.status === "failed") {
          stopPolling();
          message.error(data.error || failedMessage);
          onFailed?.(data);
        }
      } catch {
        stopPolling();
        message.error("Failed to check job status");
      }
    },
    [stopPolling, onComplete, onFailed, successMessage, failedMessage],
  );

  const startPolling = useCallback(
    (jobId: string) => {
      stopPolling();
      setIsPolling(true);
      setJob(null);
      pollJob(jobId);
      timerRef.current = setInterval(() => pollJob(jobId), interval);
    },
    [pollJob, stopPolling, interval],
  );

  return { startPolling, stopPolling, isPolling, job };
};
