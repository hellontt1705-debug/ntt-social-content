package vn.studio4k.dubbing.domain;

import lombok.Data;
import lombok.Builder;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.index.Indexed;

import java.time.Instant;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "dubbing_projects")
public class Project {
    @Id
    private String id;

    @Indexed
    private String userId;

    @Indexed
    private String folderId;

    private String name;
    private String sourceType; // "UPLOAD" | "URL"
    private String sourceUrl;
    
    // S3/MinIO Key (Không lưu binary trong MongoDB)
    private String sourceVideoS3Key;
    private String thumbnailS3Key;
    
    private Long durationMs;
    private Integer resolutionW;
    private Integer resolutionH;
    private Double fps;
    
    private String status; // "DRAFT" | "PROCESSING" | "READY" | "ERROR"
    private Instant expireAt;
    
    private Map<String, String> pipelineStatus; // transcript, translate, tts, subtitle, render
    
    private Instant createdAt;
    private Instant updatedAt;
}
