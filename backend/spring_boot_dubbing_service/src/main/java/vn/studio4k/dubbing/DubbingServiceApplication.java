package vn.studio4k.dubbing;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication
@EnableAsync
public class DubbingServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(DubbingServiceApplication.class, args);
    }
}
