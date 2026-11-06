#import <Foundation/Foundation.h>
#import <Vision/Vision.h>
#import <PDFKit/PDFKit.h>
#import <AppKit/AppKit.h>

int main(int argc, const char * argv[]) {
    @autoreleasepool {
        if (argc < 3) {
            return 1;
        }
        NSString *mode = [NSString stringWithUTF8String:argv[1]];
        NSString *filePath = [NSString stringWithUTF8String:argv[2]];
        NSURL *fileURL = [NSURL fileURLWithPath:filePath];

        if ([mode isEqualToString:@"pdf"]) {
            PDFDocument *doc = [[PDFDocument alloc] initWithURL:fileURL];
            if (!doc) return 2;
            NSInteger count = [doc pageCount];
            NSInteger limit = count < 60 ? count : 60;
            NSMutableArray<NSString *> *parts = [NSMutableArray array];
            [parts addObject:[NSString stringWithFormat:@"[PDF 共 %ld 页]", (long)count]];
            for (NSInteger i = 0; i < limit; i++) {
                PDFPage *page = [doc pageAtIndex:i];
                NSString *txt = [[page string] stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
                if (txt.length > 0) {
                    [parts addObject:[NSString stringWithFormat:@"--- 第 %ld 页 ---\n%@", (long)(i + 1), txt]];
                }
            }
            printf("%s\n", [[parts componentsJoinedByString:@"\n\n"] UTF8String]);
            return 0;
        }

        if ([mode isEqualToString:@"pdf-ocr"]) {
            PDFDocument *doc = [[PDFDocument alloc] initWithURL:fileURL];
            if (!doc) return 2;
            NSInteger count = [doc pageCount];
            if (count == 0) return 0;
            NSInteger limit = count;
            if (argc >= 4) {
                NSInteger userLimit = atoi(argv[3]);
                if (userLimit > 0 && userLimit < limit) {
                    limit = userLimit;
                }
            } else if (limit > 30) {
                limit = 30; // 默认最大处理前30页以保证响应速度
            }

            NSMutableArray<NSString *> *parts = [NSMutableArray array];
            [parts addObject:[NSString stringWithFormat:@"[PDF 共 %ld 页 · 已光栅化并经 Apple Vision 神经网络 OCR 识别前 %ld 页]", (long)count, (long)limit]];

            VNRecognizeTextRequest *req = [[VNRecognizeTextRequest alloc] init];
            req.recognitionLevel = VNRequestTextRecognitionLevelAccurate;
            req.recognitionLanguages = @[@"zh-Hans", @"zh-Hant", @"en-US"];
            req.usesLanguageCorrection = YES;

            for (NSInteger i = 0; i < limit; i++) {
                @autoreleasepool {
                    PDFPage *page = [doc pageAtIndex:i];
                    NSRect bounds = [page boundsForBox:kPDFDisplayBoxCropBox];
                    if (bounds.size.width <= 0 || bounds.size.height <= 0) {
                        bounds = [page boundsForBox:kPDFDisplayBoxMediaBox];
                    }
                    if (bounds.size.width <= 0 || bounds.size.height <= 0) continue;

                    CGFloat maxDim = MAX(bounds.size.width, bounds.size.height);
                    CGFloat scale = maxDim > 0 ? (1800.0 / maxDim) : 2.0;
                    if (scale < 1.0) scale = 1.0;
                    if (scale > 3.0) scale = 3.0;

                    size_t width = (size_t)(bounds.size.width * scale);
                    size_t height = (size_t)(bounds.size.height * scale);

                    CGColorSpaceRef colorSpace = CGColorSpaceCreateDeviceRGB();
                    CGContextRef ctx = CGBitmapContextCreate(NULL, width, height, 8, width * 4, colorSpace, kCGImageAlphaPremultipliedLast | kCGBitmapByteOrder32Big);
                    CGColorSpaceRelease(colorSpace);

                    if (!ctx) continue;

                    // 纯白背景填充
                    CGContextSetRGBFillColor(ctx, 1.0, 1.0, 1.0, 1.0);
                    CGContextFillRect(ctx, CGRectMake(0, 0, width, height));

                    CGContextSaveGState(ctx);
                    CGContextScaleCTM(ctx, scale, scale);
                    CGContextTranslateCTM(ctx, -bounds.origin.x, -bounds.origin.y);
                    [page drawWithBox:kPDFDisplayBoxCropBox toContext:ctx];
                    CGContextRestoreGState(ctx);

                    CGImageRef cgImg = CGBitmapContextCreateImage(ctx);
                    CGContextRelease(ctx);

                    if (!cgImg) continue;

                    VNImageRequestHandler *handler = [[VNImageRequestHandler alloc] initWithCGImage:cgImg options:@{}];
                    NSError *err = nil;
                    [handler performRequests:@[req] error:&err];
                    CGImageRelease(cgImg);

                    if (!err && req.results.count > 0) {
                        NSMutableArray<NSString *> *lines = [NSMutableArray array];
                        for (VNRecognizedTextObservation *obs in req.results) {
                            VNRecognizedText *top = [[obs topCandidates:1] firstObject];
                            if (top.string.length > 0) {
                                [lines addObject:top.string];
                            }
                        }
                        if (lines.count > 0) {
                            [parts addObject:[NSString stringWithFormat:@"--- 第 %ld 页 (OCR) ---\n%@", (long)(i + 1), [lines componentsJoinedByString:@"\n"]]];
                        }
                    }
                }
            }
            printf("%s\n", [[parts componentsJoinedByString:@"\n\n"] UTF8String]);
            return 0;
        }

        if ([mode isEqualToString:@"ocr"]) {
            NSImage *img = [[NSImage alloc] initWithContentsOfURL:fileURL];
            if (!img) return 0;
            CGImageRef cgImg = [img CGImageForProposedRect:NULL context:nil hints:nil];
            if (!cgImg) return 0;

            VNRecognizeTextRequest *req = [[VNRecognizeTextRequest alloc] init];
            req.recognitionLevel = VNRequestTextRecognitionLevelAccurate;
            req.recognitionLanguages = @[@"zh-Hans", @"zh-Hant", @"en-US"];
            req.usesLanguageCorrection = YES;

            VNImageRequestHandler *handler = [[VNImageRequestHandler alloc] initWithCGImage:cgImg options:@{}];
            NSError *err = nil;
            [handler performRequests:@[req] error:&err];
            if (!err && req.results.count > 0) {
                NSMutableArray<NSString *> *lines = [NSMutableArray array];
                for (VNRecognizedTextObservation *obs in req.results) {
                    VNRecognizedText *top = [[obs topCandidates:1] firstObject];
                    if (top.string.length > 0) {
                        [lines addObject:top.string];
                    }
                }
                printf("%s\n", [[lines componentsJoinedByString:@"\n"] UTF8String]);
            }
            return 0;
        }
    }
    return 0;
}
