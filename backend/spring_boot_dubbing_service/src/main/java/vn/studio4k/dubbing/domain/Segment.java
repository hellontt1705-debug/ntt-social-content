package vn.studio4k.dubbing.domain;

import lombok.Data;
import lombok.Builder;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.index.Indexed;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "dubbing_segments")
public class Segment {
    @Id
    private String id;

    @Indexed
    private String projectId;

    private Integer segIndex;
    private Long startMs;
    private Long endMs;
    private Long durationMs;

    // Lời thoại gốc
    private String originalText;
    private Integer originalCharCount;
    private Double originalCharSpeed; // ký tự / giây (c/s)
    private String ocrRoiJson;

    // Bản dịch
    private String translatedText;
    private Integer translatedCharCount;
    private Double translatedCharSpeed;
    private Integer translatedWordCount;

    // Lồng tiếng TTS
    private String voiceId;
    private String voiceProvider;
    private Double ttsSpeed;
    private String audioS3Key;
    private Long audioDurationMs;
    private Long deltaMs;

    // Trạng thái kiểm soát chất lượng
    private Boolean isOverflow; // Tràn khung thời gian
    private Boolean isTooFast;  // Tốc độ đọc quá nhanh
    private String status;      // "PERFECT_FIT" | "OVERFLOW" | "TOO_FAST"
}
