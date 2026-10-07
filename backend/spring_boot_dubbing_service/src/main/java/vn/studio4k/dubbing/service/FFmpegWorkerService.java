package vn.studio4k.dubbing.service;

import org.springframework.stereotype.Service;
import lombok.extern.slf4j.Slf4j;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.File;
import java.util.List;
import java.util.ArrayList;

@Slf4j
@Service
public class FFmpegWorkerService {

    /**
     * Thực thi FFmpeg render: làm mờ vùng phụ đề gốc theo timestamp và in hardsub ASS
     */
    public boolean renderVideoWithSubtitlesAndBlur(
            String sourceVideoPath,
            String assSubtitlePath,
            String voiceoverWavPath,
            String outputPath,
            String blurFilterExpr
    ) {
        List<String> command = new ArrayList<>();
        command.add("ffmpeg");
        command.add("-y");
        command.add("-i");
        command.add(sourceVideoPath);

        // Filter Complex
        StringBuilder filter = new StringBuilder();
        String currentStream = "0:v";

        if (blurFilterExpr != null && !blurFilterExpr.isBlank()) {
            filter.append(blurFilterExpr);
            currentStream = "v_blur";
        }

        if (assSubtitlePath != null && new File(assSubtitlePath).exists()) {
            String escapedAss = assSubtitlePath.replace("\\", "/").replace(":", "\\:");
            if (filter.length() > 0) filter.append("; ");
            filter.append(String.format("[%s]ass='%s'[v_out]", currentStream, escapedAss));
            currentStream = "v_out";
        }

        if (filter.length() > 0) {
            command.add("-filter_complex");
            command.add(filter.toString());
            command.add("-map");
            command.add("[" + currentStream + "]");
        } else {
            command.add("-c:v");
            command.add("copy");
        }

        // Voiceover audio replacement / mixing
        if (voiceoverWavPath != null && new File(voiceoverWavPath).exists()) {
            command.add("-i");
            command.add(voiceoverWavPath);
            command.add("-map");
            command.add("1:a");
            command.add("-c:a");
            command.add("aac");
            command.add("-b:a");
            command.add("192k");
        } else {
            command.add("-c:a");
            command.add("copy");
        }

        command.add("-c:v");
        command.add("libx264");
        command.add("-crf");
        command.add("20");
        command.add("-preset");
        command.add("fast");
        command.add(outputPath);

        log.info("Executing FFmpeg command: {}", String.join(" ", command));

        try {
            ProcessBuilder processBuilder = new ProcessBuilder(command);
            processBuilder.redirectErrorStream(true);
            Process process = processBuilder.start();

            try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    // Trong production: phân tích timecode để emit websocket progress
                    log.debug("[FFmpeg Output] {}", line);
                }
            }

            int exitCode = process.waitFor();
            log.info("FFmpeg process exited with code: {}", exitCode);
            return exitCode == 0;
        } catch (Exception e) {
            log.error("FFmpeg render failed", e);
            return false;
        }
    }
}
