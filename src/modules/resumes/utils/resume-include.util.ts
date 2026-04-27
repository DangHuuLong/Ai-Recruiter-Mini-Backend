export function getResumeInclude() {
  return {
    candidate: {
      select: {
        id: true,
        fullName: true,
        primaryEmail: true,
        primaryPhone: true,
        location: true,
      },
    },
    fileAsset: {
      select: {
        id: true,
        fileName: true,
        originalFileUrl: true,
        storageKey: true,
        fileType: true,
        fileSizeBytes: true,
        checksum: true,
        bucket: true,
        status: true,
        uploadedAt: true,
      },
    },
  };
}
