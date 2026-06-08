package sftp

import (
	"fmt"
	"io"
	"sync"
	"time"

	pkgsftp "github.com/pkg/sftp"
)

type UploadJob struct {
	ID         string
	RemotePath string
	Size       int64
	Progress   int64
	Status     string
	Error      string
	Speed      int64
	StartedAt  time.Time
}

type UploadProgress struct {
	JobID    string `json:"job_id"`
	Progress int64  `json:"progress"`
	Size     int64  `json:"size"`
	Speed    int64  `json:"speed"`
	Status   string `json:"status"`
	Error    string `json:"error"`
}

type UploadQueue struct {
	MaxConcurrent int
	jobs          map[string]*UploadJob
	mu            sync.RWMutex
	semaphore     chan struct{}
	progressCh    chan UploadProgress
}

func NewUploadQueue(maxConcurrent int) *UploadQueue {
	if maxConcurrent < 1 || maxConcurrent > 10 {
		maxConcurrent = 3
	}
	return &UploadQueue{
		MaxConcurrent: maxConcurrent,
		jobs:          make(map[string]*UploadJob),
		semaphore:     make(chan struct{}, maxConcurrent),
		progressCh:    make(chan UploadProgress, 100),
	}
}

func (q *UploadQueue) ProgressChannel() <-chan UploadProgress {
	return q.progressCh
}

func (q *UploadQueue) Upload(client *pkgsftp.Client, job *UploadJob, reader io.Reader) error {
	q.semaphore <- struct{}{}
	defer func() { <-q.semaphore }()

	q.mu.Lock()
	q.jobs[job.ID] = job
	q.mu.Unlock()

	job.Status = "uploading"
	job.StartedAt = time.Now()
	q.notify(job.ID, 0, job.Size, 0, "uploading", "")

	remoteFile, err := client.Create(job.RemotePath)
	if err != nil {
		job.Status = "error"
		job.Error = err.Error()
		q.notify(job.ID, 0, job.Size, 0, "error", err.Error())
		return err
	}
	defer remoteFile.Close()

	buf := make([]byte, 32*1024)
	var written int64
	lastReport := time.Now()
	var lastBytes int64

	for {
		nr, readErr := reader.Read(buf)
		if nr > 0 {
			nw, writeErr := remoteFile.Write(buf[:nr])
			written += int64(nw)
			job.Progress = written

			if time.Since(lastReport) > 100*time.Millisecond {
				elapsed := time.Since(lastReport).Seconds()
				speed := int64(float64(written-lastBytes) / elapsed)
				q.notify(job.ID, written, job.Size, speed, "uploading", "")
				lastReport = time.Now()
				lastBytes = written
			}

			if writeErr != nil {
				job.Status = "error"
				job.Error = writeErr.Error()
				q.notify(job.ID, written, job.Size, 0, "error", writeErr.Error())
				return writeErr
			}
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			job.Status = "error"
			job.Error = readErr.Error()
			q.notify(job.ID, written, job.Size, 0, "error", readErr.Error())
			return readErr
		}
	}

	job.Status = "done"
	job.Progress = job.Size
	q.notify(job.ID, job.Size, job.Size, 0, "done", "")
	return nil
}

func (q *UploadQueue) notify(jobID string, progress, size, speed int64, status, errMsg string) {
	select {
	case q.progressCh <- UploadProgress{
		JobID: jobID, Progress: progress, Size: size,
		Speed: speed, Status: status, Error: errMsg,
	}:
	default:
	}
}

func UploadFile(client *pkgsftp.Client, remotePath string, reader io.Reader, size int64) error {
	q := NewUploadQueue(1)
	job := &UploadJob{ID: remotePath, RemotePath: remotePath, Size: size}
	return q.Upload(client, job, reader)
}

func EnsureRemoteDir(client *pkgsftp.Client, remotePath string) error {
	dir := remotePath[:len(remotePath)-len(lastSegment(remotePath))]
	if dir == "" {
		return nil
	}
	if _, err := client.Stat(dir); err == nil {
		return nil
	}
	return client.MkdirAll(dir)
}

func lastSegment(p string) string {
	for i := len(p) - 1; i >= 0; i-- {
		if p[i] == '/' {
			return p[i+1:]
		}
	}
	return p
}

func UploadFromReader(client *pkgsftp.Client, remotePath string, reader io.Reader) (int64, error) {
	if err := EnsureRemoteDir(client, remotePath); err != nil {
		return 0, fmt.Errorf("mkdir: %w", err)
	}
	remoteFile, err := client.Create(remotePath)
	if err != nil {
		return 0, err
	}
	defer remoteFile.Close()
	n, err := io.Copy(remoteFile, reader)
	return n, err
}
